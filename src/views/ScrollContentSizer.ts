/*
 * Copyright 2018-2020 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Developed on behalf of: DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import debounce from "debounce";

interface SavedHeightStyle {
  style: CSSStyleDeclaration;
  property: string;
  value: string;
  priority: string;
}

interface BodyHeightConstraint extends SavedHeightStyle {
  applied: string | undefined;
}

interface ContentHeightViewport {
  height: number;
  width: number;
  styles: string;
}

/** Fork-specific scroll sizing, independent of book navigation and overlays. */
export default class ScrollContentSizer {
  private _contentResizeObserver: ResizeObserver | undefined;
  private _contentMutationObserver: MutationObserver | undefined;
  private _contentResizeBody: HTMLElement | undefined;
  private _contentResizeHandler: (() => void) | undefined;
  private _contentHeightRefreshHandler: (() => void) | undefined;
  private _contentToggleHandler: (() => void) | undefined;
  private _contentHeightStyles: SavedHeightStyle[] = [];
  private _contentResizeWaiters = new Set<() => void>();

  constructor(private readonly getViewportHeight: () => number) {}

  whenSized(): Promise<void> {
    if (!this._contentResizeBody) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this._contentResizeWaiters.add(resolve);
    });
  }

  private finishContentResize(): void {
    for (const resolve of this._contentResizeWaiters) resolve();
    this._contentResizeWaiters.clear();
  }

  /** Removes resize listeners and restores publication styles. */
  unbind(): void {
    this._contentResizeObserver?.disconnect();
    this._contentMutationObserver?.disconnect();
    if (this._contentHeightRefreshHandler) {
      this._contentResizeBody?.ownerDocument.removeEventListener(
        "load",
        this._contentHeightRefreshHandler,
        { capture: true }
      );
    }
    if (this._contentToggleHandler) {
      this._contentResizeBody?.removeEventListener(
        "toggle",
        this._contentToggleHandler,
        { capture: true }
      );
    }
    this._contentResizeObserver = undefined;
    this._contentMutationObserver = undefined;
    this._contentResizeBody = undefined;
    this._contentResizeHandler = undefined;
    this._contentToggleHandler = undefined;
    this._contentHeightRefreshHandler = undefined;
    for (const savedStyle of this._contentHeightStyles) {
      this.restoreHeightStyle(savedStyle);
    }
    this._contentHeightStyles = [];
    this.finishContentResize();
  }

  bind(iframe: HTMLIFrameElement | undefined): void {
    const doc = iframe?.contentDocument;
    const body = doc?.body;
    const win = iframe?.contentWindow;
    if (!doc || !body || !iframe || !win) return;

    // Do not re-bind if the same body is already being observed.
    if (this._contentResizeBody === body) {
      this._contentResizeHandler?.();
      return;
    }

    this.unbind();

    const bodyConstraints = this.prepareContentHeightStyles(doc);
    let declared: string[] | undefined;
    let constraintViewport: ContentHeightViewport | undefined;
    let _resizeObserver: ResizeObserver | undefined;
    const debouncedResize = debounce(() => {
      // Ignore pending callbacks after the observer has been unbound/replaced.
      if (this._contentResizeObserver !== _resizeObserver) return;
      // Defer writes to avoid re-triggering the same ResizeObserver cycle.
      requestAnimationFrame(() => {
        if (this._contentResizeObserver !== _resizeObserver) return;
        const minHeight = this.getViewportHeight();
        const viewport: ContentHeightViewport = {
          height: minHeight,
          width: iframe.clientWidth,
          styles: doc.documentElement.style.cssText,
        };
        const measureConstraints =
          !declared ||
          constraintViewport?.height !== viewport.height ||
          constraintViewport?.width !== viewport.width ||
          constraintViewport?.styles !== viewport.styles;
        const scrollContainer = iframe.parentElement;
        const scrollPosition =
          measureConstraints && scrollContainer
            ? {
                top: scrollContainer.scrollTop,
                left: scrollContainer.scrollLeft,
              }
            : undefined;
        if (measureConstraints) {
          declared = this.resolveBodyHeightConstraints(
            iframe,
            bodyConstraints,
            viewport
          );
          constraintViewport = viewport;
        }
        if (!declared) return;
        this.updateContentHeight(iframe, minHeight, bodyConstraints, declared);
        if (scrollContainer && scrollPosition) {
          scrollContainer.scrollTop = scrollPosition.top;
          scrollContainer.scrollLeft = scrollPosition.left;
        }
        this.finishContentResize();
      });
    }, 20);
    _resizeObserver = new ResizeObserver(debouncedResize);
    this._contentResizeObserver = _resizeObserver;
    this._contentResizeHandler = debouncedResize;
    this._contentHeightRefreshHandler = (event?: Event) => {
      const target = event?.target as Element | null;
      if (
        !target?.localName ||
        target.localName === "link" ||
        target.localName === "style"
      ) {
        declared = undefined;
      }
      debouncedResize.call(this);
    };
    doc.addEventListener("load", this._contentHeightRefreshHandler, {
      capture: true,
    });
    // Content changes can flip selectors like body:has(details[open]); the
    // observers skip the helper's own style writes, so these are publication changes.
    const refreshConstraints = () => {
      declared = undefined;
      debouncedResize();
    };
    body.addEventListener("toggle", refreshConstraints, { capture: true });
    this._contentToggleHandler = refreshConstraints;
    this._contentMutationObserver = new MutationObserver(refreshConstraints);
    this._contentMutationObserver.observe(body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    _resizeObserver.observe(body, { box: "border-box" });
    if (iframe.parentElement) _resizeObserver.observe(iframe.parentElement);
    this._contentResizeBody = body;
    this._contentResizeHandler();
  }

  /** Saves publication height styles and makes the root intrinsically sized. */
  private prepareContentHeightStyles(doc: Document): BodyHeightConstraint[] {
    // Keep the root intrinsic without suppressing the publication's body styles.
    const rootStyle = doc.documentElement.style;
    for (const [property, value] of [
      ["height", "auto"],
      ["min-height", "0"],
      ["max-height", "none"],
    ]) {
      this._contentHeightStyles.push({
        style: rootStyle,
        property,
        value: rootStyle.getPropertyValue(property),
        priority: rootStyle.getPropertyPriority(property),
      });
      rootStyle.setProperty(property, value, "important");
    }

    const bodyConstraints: BodyHeightConstraint[] = [
      "height",
      "min-height",
      "max-height",
    ].map((property) => ({
      style: doc.body.style,
      property,
      value: doc.body.style.getPropertyValue(property),
      priority: doc.body.style.getPropertyPriority(property),
      applied: undefined,
    }));
    this._contentHeightStyles.push(...bodyConstraints);
    return bodyConstraints;
  }

  private restoreHeightStyle(
    savedStyle: SavedHeightStyle,
    style = savedStyle.style
  ): void {
    const { property, value, priority } = savedStyle;
    if (value) {
      style.setProperty(property, value, priority);
    } else {
      style.removeProperty(property);
    }
  }

  /** Resolves body constraints against the reader viewport before content sizing. */
  private resolveBodyHeightConstraints(
    iframe: HTMLIFrameElement,
    bodyConstraints: BodyHeightConstraint[],
    viewport: ContentHeightViewport
  ): string[] | undefined {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc?.body || !win) return;

    for (const constraint of bodyConstraints) {
      if (constraint.applied === undefined) continue;
      this.restoreHeightStyle(constraint);
      constraint.applied = undefined;
    }
    const temporaryStyles = [
      { style: iframe.style, property: "height" },
      { style: doc.documentElement.style, property: "height" },
      { style: doc.body.style, property: "display" },
    ].map(({ style, property }) => ({
      style,
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
    }));
    let declared: string[];
    // Measure before painting, then restore the live chapter's styles.
    // Hiding the body distinguishes declared auto from its used pixel height.
    try {
      iframe.style.setProperty("height", viewport.height + "px", "important");
      doc.documentElement.style.setProperty(
        "height",
        viewport.height + "px",
        "important"
      );
      doc.body.style.setProperty("display", "none", "important");
      // Update the outer layout before resolving the iframe's viewport units.
      iframe.getBoundingClientRect();
      declared = bodyConstraints.map(({ property }) =>
        win.getComputedStyle(doc.body).getPropertyValue(property)
      );
      if (declared.some((value) => value.includes("%"))) {
        // createElement yields a style-less null-namespace element in XHTML documents.
        const measurement = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "div"
        ) as HTMLElement;
        measurement.style.cssText =
          "all:initial!important;display:block!important;position:fixed!important;box-sizing:content-box!important;min-height:0!important;max-height:none!important;padding:0!important;border:0!important;";
        doc.documentElement.appendChild(measurement);
        try {
          for (const [index, value] of declared.entries()) {
            if (!value.includes("%")) continue;
            measurement.style.setProperty("height", value, "important");
            declared[index] = win.getComputedStyle(measurement).height;
          }
        } finally {
          measurement.remove();
        }
      }
    } finally {
      for (const savedStyle of temporaryStyles) {
        this.restoreHeightStyle(savedStyle);
      }
      iframe.getBoundingClientRect();
    }
    const unconstrained = ["auto", "0px", "none"];
    for (const [index, constraint] of bodyConstraints.entries()) {
      // Matching samples cannot detect viewport units hidden by min/max/clamp.
      if (declared[index] !== unconstrained[index]) {
        constraint.applied = declared[index];
        constraint.style.setProperty(
          constraint.property,
          constraint.applied,
          "important"
        );
      }
    }
    return declared;
  }

  /** Fills unconstrained short content and fits the iframe to rendered content. */
  private updateContentHeight(
    iframe: HTMLIFrameElement,
    minHeight: number,
    bodyConstraints: BodyHeightConstraint[],
    declared: string[]
  ): void {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc?.body || !win) return;
    const body = doc.body;
    const bodyStyle = win.getComputedStyle(body);
    const htmlStyle = win.getComputedStyle(doc.documentElement);
    const pixels = (value: string) => parseFloat(value) || 0;
    const bodyBorders =
      pixels(bodyStyle.borderTopWidth) + pixels(bodyStyle.borderBottomWidth);

    const rootTop = doc.documentElement.getBoundingClientRect().top;
    const availableMinimum = Math.max(
      0,
      minHeight -
        (body.getBoundingClientRect().top - rootTop) -
        pixels(bodyStyle.marginBottom) -
        pixels(htmlStyle.paddingBottom) -
        pixels(htmlStyle.borderBottomWidth) -
        (bodyStyle.boxSizing === "border-box"
          ? 0
          : pixels(bodyStyle.paddingTop) +
            pixels(bodyStyle.paddingBottom) +
            bodyBorders)
    );
    if (
      declared[0] === "auto" &&
      pixels(declared[1]) === 0 &&
      declared[2] === "none" &&
      bodyConstraints[1].applied !== availableMinimum + "px"
    ) {
      bodyConstraints[1].applied = availableMinimum + "px";
      body.style.setProperty(
        "min-height",
        bodyConstraints[1].applied,
        "important"
      );
    }
    const bodyRect = body.getBoundingClientRect();
    let bottom =
      bodyRect.top +
      Math.max(bodyRect.height, body.scrollHeight + bodyBorders) +
      pixels(bodyStyle.marginBottom);

    // Child margins can collapse through the body. Use rendered margin
    // boxes rather than root viewport heights, which prevent shrinking.
    for (const child of Array.from(body.children)) {
      const style = win.getComputedStyle(child);
      if (
        style.display === "none" ||
        style.position === "fixed" ||
        style.position === "absolute"
      ) {
        continue;
      }
      bottom = Math.max(
        bottom,
        child.getBoundingClientRect().bottom + pixels(style.marginBottom)
      );
    }

    const height = Math.ceil(
      bottom -
        rootTop +
        pixels(htmlStyle.paddingBottom) +
        pixels(htmlStyle.borderBottomWidth)
    );

    const nextHeight = Math.max(minHeight, height) + "px";
    if (height && iframe.height !== nextHeight) {
      iframe.height = nextHeight;
    }
  }
}
