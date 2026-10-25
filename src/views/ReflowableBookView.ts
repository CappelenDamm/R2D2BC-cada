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

import { UserProperty } from "../model/user-settings/UserProperties";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import * as BrowserUtilities from "../utils/BrowserUtilities";
import Store from "../store/Store";
import BookView from "./BookView";
import {
  IFrameAttributes,
  IFrameNavigator,
} from "../navigator/IFrameNavigator";
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

export default class ReflowableBookView implements BookView {
  layout = "reflowable";

  private readonly USERSETTINGS = "userSetting";
  private readonly store: Store;
  private scrollMode: boolean;
  private stopped = false;
  navigator: IFrameNavigator;
  constructor(store: Store) {
    this.store = store;

    if (this.scrollMode) {
      this.name = "readium-scroll-on";
      this.label = "Scrolling";
    } else {
      this.name = "readium-scroll-off";
      this.label = "Paginated";
    }
  }

  async setMode(scroll: boolean): Promise<void> {
    if (this.stopped) return;
    this.scrollMode = scroll;
    if (scroll) {
      this.name = "readium-scroll-on";
      this.label = "Scrolling";
      let doc = this.iframe.contentDocument;
      if (doc) {
        const head = HTMLUtilities.findIframeElement(
          doc,
          "head"
        ) as HTMLHeadElement;
        if (head) {
          const viewport = HTMLUtilities.findElement(
            head,
            "meta[name=viewport]"
          );
          if (viewport) {
            viewport.remove();
          }
        }
        const html = HTMLUtilities.findIframeElement(
          doc,
          "html"
        ) as HTMLHtmlElement;
        if (html) {
          html.style.setProperty("--USER__scroll", "readium-scroll-on");
        }
        // Remove column spacer — it creates whitespace in scroll mode
        const spacer = doc.getElementById("r2d2bc-column-spacer");
        if (spacer) spacer.remove();
      }
      await this.setSize();
    } else {
      this.unbindContentResizeObserver();
      this.height = BrowserUtilities.getHeight() - 40 - this.attributes.margin;
      this.name = "readium-scroll-off";
      this.label = "Paginated";
      // any is necessary because CSSStyleDeclaration type does not include
      // all the vendor-prefixed attributes.

      this.checkForFixedScrollWidth();

      let doc = this.iframe.contentDocument;
      if (doc) {
        const html = HTMLUtilities.findIframeElement(
          doc,
          "html"
        ) as HTMLHtmlElement;
        if (html) {
          html.style.setProperty("--USER__scroll", "readium-scroll-off");
        }
      }
      await this.setSize();
      this.padOddColumns();
    }
    if (this.stopped) return;
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate();
    }
  }

  name: string;
  label: string;
  iframe: HTMLIFrameElement;
  sideMargin: number = 20;
  height: number = 0;
  attributes: IFrameAttributes = { margin: 0 };

  start(): void {
    this.stopped = false;
    if (this.scrollMode) {
      let doc = this.iframe.contentDocument;
      if (doc) {
        const head = HTMLUtilities.findIframeElement(
          doc,
          "head"
        ) as HTMLHeadElement;

        if (head) {
          const viewport = HTMLUtilities.findElement(
            head,
            "meta[name=viewport]"
          );
          if (viewport) {
            viewport.remove();
          }
        }
      }
      this.setSize();
    } else {
      this.iframe.height = "0";
      this.iframe.width = "0";

      // any is necessary because CSSStyleDeclaration type does not include
      // all the vendor-prefixed attributes.
      this.setSize();
      const viewportElement = document.createElement("meta");
      viewportElement.name = "viewport";
      viewportElement.content =
        "width=device-width, initial-scale=1, maximum-scale=1";

      this.checkForFixedScrollWidth();
    }
  }

  stop(): void {
    this.stopped = true;
    this.unbindContentResizeObserver();

    this.iframe.height = "0";
    this.iframe.width = "0";
    let doc = this.iframe.contentDocument;
    if (doc) {
      const body = HTMLUtilities.findIframeElement(
        this.iframe.contentDocument,
        "body"
      ) as HTMLBodyElement;
      const images = Array.prototype.slice.call(body.querySelectorAll("img"));
      for (const image of images) {
        image.style.maxWidth = "";
      }
    }
  }

  getCurrentPosition(): number {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );

    if (this.scrollMode) {
      return wrapper.scrollTop / this.scrollingElement.scrollHeight;
    } else {
      const width = this.getColumnWidth();
      const leftWidth = this.getLeftColumnsWidth();
      const rightWidth = this.getRightColumnsWidth();
      const totalWidth = leftWidth + width + rightWidth;
      return leftWidth / totalWidth;
    }
  }

  goToProgression(position: number): void {
    if (this.stopped) return;
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    if (this.scrollMode) {
      wrapper.scrollTop = this.scrollingElement.scrollHeight * position;
    } else {
      // If the window has changed size since the columns were set up,
      // we need to reset position, so we can determine the new total width.

      const width = this.getColumnWidth();
      const leftWidth = this.getLeftColumnsWidth();
      const rightWidth = this.getRightColumnsWidth();
      const totalWidth = leftWidth + width + rightWidth;

      const newLeftWidth = position * totalWidth;

      // Round the new left width, so it's a multiple of the column width.

      let roundedLeftWidth = Math.round(newLeftWidth / width) * width;
      if (roundedLeftWidth >= totalWidth) {
        // We've gone too far and all the columns are off to the left.
        // Move one column back into the viewport.
        roundedLeftWidth = roundedLeftWidth - width;
      }
      this.setLeftColumnsWidth(roundedLeftWidth);
    }
  }

  goToCssSelector(cssSelector: string, relative?: boolean): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      let element = doc.querySelector(cssSelector) as HTMLElement;
      this.goToElement(element, relative);
    }
  }

  goToFragment(fragment: string, relative?: boolean): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      const element = doc.getElementById(fragment) as HTMLElement;
      this.goToElement(element, relative);
    }
  }

  snap(element: HTMLElement | null, _relative?: boolean): void {
    if (element) {
      if (this.scrollMode) {
        //     // Put the element as close to the top as possible.
        //     document.scrollingElement.scrollTop = element.offsetTop;
      } else {
        // Get the element's position in the iframe, and
        // round that to figure out the column it's in.
        // There is a bug in Safari when using getBoundingClientRect
        // on an element that spans multiple columns. Temporarily
        // set the element's height to fit it on one column, so we
        // can determine the first column position.
        const originalHeight = element.style.height;
        element.style.height = "0";

        const width = this.getColumnWidth();
        const left =
          this.getLeftColumnsWidth() + element.getBoundingClientRect().left;
        let roundedLeftWidth = Math.floor(left / width) * width;

        // Restore element's original height.
        element.style.height = originalHeight;
        this.setLeftColumnsWidth(roundedLeftWidth);

        if (this.navigator.rights.enableContentProtection) {
          this.navigator.contentProtectionModule?.recalculate(0);
        }
      }
    }
  }

  goToElement(
    element: HTMLElement | null,
    relative?: boolean,
    scrollPosition?: ScrollLogicalPosition
  ): void {
    if (this.stopped || !element) return;

    if (this.scrollMode) {
      this.focusElement(element, scrollPosition);
      return;
    }

    // Get the element's position in the iframe, and
    // round that to figure out the column it's in.

    // There is a bug in Safari when using getBoundingClientRect
    // on an element that spans multiple columns. Temporarily
    // set the element's height to fit it on one column, so we
    // can determine the first column position.
    const originalHeight = element.style.height;
    element.style.height = "0";

    const left = element.getBoundingClientRect().left;
    const width = this.getColumnWidth();
    const diff = this.scrollingElement.scrollLeft - width;
    // let roundedLeftWidth = Math.ceil(left / width) * width;
    let roundedLeftWidth = Math.ceil(left / width) * width + diff;
    if (relative) {
      const origin = this.getLeftColumnsWidth();
      roundedLeftWidth = Math.ceil(left / width) * width + origin;
    }

    // Restore element's original height.
    element.style.height = originalHeight;
    this.setLeftColumnsWidth(roundedLeftWidth);
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate(200);
    }
  }

  private focusElement(
    element: HTMLElement,
    scrollPosition?: ScrollLogicalPosition
  ): void {
    element.scrollIntoView({ block: scrollPosition ?? "start" });

    if (element.tabIndex < 0) {
      element.tabIndex = -1;
    }

    element.focus({ preventScroll: true });
  }

  // at top in scroll mode
  atStart(): boolean {
    if (this.scrollMode) {
      const wrapper = HTMLUtilities.findRequiredElement(
        document,
        "#iframe-wrapper"
      );

      return wrapper.scrollTop === 0;
    } else {
      const leftWidth = this.getLeftColumnsWidth();
      return leftWidth <= 0;
    }
  }

  // at bottom in scroll mode
  atEnd(): boolean {
    if (this.scrollMode) {
      const wrapper = HTMLUtilities.findRequiredElement(
        document,
        "#iframe-wrapper"
      );
      return (
        Math.ceil(this.scrollingElement.scrollHeight - wrapper.scrollTop) - 1 <=
        BrowserUtilities.getHeight()
      );
    } else {
      // Sub-pixel rounding: getRightColumnsWidth() can return fractional values
      // like 0.09 due to browser layout — Math.floor normalizes to 0.
      const rightWidth = Math.floor(this.getRightColumnsWidth());
      if (rightWidth <= 0) return true;
      // If a spacer was injected, don't use page count check — it can
      // trigger too early. Only rightWidth determines the real end.
      const doc = this.iframe.contentDocument;
      if (doc?.getElementById("r2d2bc-column-spacer")) return rightWidth <= 5;
      return Math.ceil(this.getCurrentPage()) === this.getPageCount();
    }
  }

  goToPreviousPage(): void {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );

    if (this.scrollMode) {
      const leftHeight = wrapper.scrollTop;
      const height = this.getScreenHeight() - 40;
      const offset = leftHeight - height;
      if (offset >= 0) {
        wrapper.scrollTop = offset;
      } else {
        wrapper.scrollTop = 0;
      }
    } else {
      const leftWidth = this.getLeftColumnsWidth();
      const width = this.getColumnWidth();
      const offset = leftWidth - width;
      if (offset >= 0) {
        this.setLeftColumnsWidth(offset);
      } else {
        this.setLeftColumnsWidth(0);
      }
      this.navigator.checkResourcePosition();
    }
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate();
    }
  }

  goToNextPage(): void {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );

    if (this.scrollMode) {
      const leftHeight = wrapper.scrollTop;
      const height = this.getScreenHeight() - 40;
      const scrollHeight = this.scrollingElement.scrollHeight;
      const offset = leftHeight + height;
      if (offset < scrollHeight) {
        wrapper.scrollTop = offset;
      } else {
        wrapper.scrollTop = scrollHeight;
      }
    } else {
      const leftWidth = this.getLeftColumnsWidth();
      const width = this.getColumnWidth();
      const scrollWidth = this.scrollWidth;
      const offset = leftWidth + width;
      if (offset < scrollWidth) {
        this.setLeftColumnsWidth(offset);
      } else {
        this.setLeftColumnsWidth(scrollWidth);
      }
      this.navigator.checkResourcePosition();
    }
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate();
    }
  }

  // doesn't exist in scroll mode
  getCurrentPage(): number {
    if (this.scrollMode) {
      return 0;
    } else {
      return this.getCurrentPosition() * this.getPageCount() + 1;
    }
  }

  // doesn't exist in scroll mode
  getPageCount(): number {
    if (this.scrollMode) {
      return 0;
    } else {
      const width = this.getColumnWidth();
      return this.scrollWidth / width;
    }
  }

  isPaginated() {
    if (this.iframe) {
      let doc = this.iframe.contentDocument;
      if (doc) {
        const html = HTMLUtilities.findIframeElement(
          doc,
          "html"
        ) as HTMLHtmlElement;
        if (html) {
          const scroll =
            "readium-scroll-on" ===
            html.style.getPropertyValue("--USER__scroll");
          return !scroll;
        }
      }
    }
    return !this.scrollMode;
  }

  isScrollMode() {
    if (this.iframe) {
      let doc = this.iframe.contentDocument;
      if (doc) {
        const html = HTMLUtilities.findIframeElement(
          doc,
          "html"
        ) as HTMLHtmlElement;
        if (html) {
          return (
            "readium-scroll-on" ===
            html.style.getPropertyValue("--USER__scroll")
          );
        }
      }
    }
    return this.scrollMode;
  }

  async getProperty(name: string): Promise<UserProperty | null> {
    let array = await this.store.get(this.USERSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      properties = properties.filter((el: UserProperty) => el.name === name);
      if (properties.length === 0) {
        return null;
      }
      return properties[0];
    }
    return null;
  }

  // scrolling functions

  getScreenHeight(): number {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    return wrapper.clientHeight;
  }

  private _contentResizeObserver: ResizeObserver | undefined;
  private _contentResizeBody: HTMLElement | undefined;
  private _contentResizeHandler: (() => void) | undefined;
  private _contentHeightRefreshHandler: (() => void) | undefined;
  private _contentHeightProbe: HTMLIFrameElement | undefined;
  private _contentHeightStyles: SavedHeightStyle[] = [];
  private _contentResizeWaiters = new Set<() => void>();

  private finishContentResize(): void {
    for (const resolve of this._contentResizeWaiters) resolve();
    this._contentResizeWaiters.clear();
  }

  /** Removes resize listeners and the probe, then restores publication styles. */
  private unbindContentResizeObserver() {
    this._contentResizeObserver?.disconnect();
    this._contentHeightProbe?.remove();
    this._contentHeightProbe = undefined;
    if (this._contentHeightRefreshHandler) {
      this._contentResizeBody?.ownerDocument.removeEventListener(
        "load",
        this._contentHeightRefreshHandler,
        { capture: true }
      );
    }
    if (this._contentResizeHandler) {
      this._contentResizeBody?.removeEventListener(
        "toggle",
        this._contentResizeHandler,
        { capture: true }
      );
    }
    this._contentResizeObserver = undefined;
    this._contentResizeBody = undefined;
    this._contentResizeHandler = undefined;
    this._contentHeightRefreshHandler = undefined;
    for (const savedStyle of this._contentHeightStyles) {
      this.restoreHeightStyle(savedStyle);
    }
    this._contentHeightStyles = [];
    this.finishContentResize();
  }

  /** Binds a ResizeObserver to the iframe's body to adjust its height dynamically.
   * This is needed to accommodate content that changes size after initial load,
   * such as the <details> element expanding/collapsing.
   */
  bindContentResizeObserver(iframe: HTMLIFrameElement | undefined) {
    if (this.stopped || !this.isScrollMode()) return;
    const doc = iframe?.contentDocument;
    const body = doc?.body;
    const win = iframe?.contentWindow;
    if (!doc || !body || !iframe || !win) return;

    // Do not re-bind if the same body is already being observed.
    if (this._contentResizeBody === body) {
      this._contentResizeHandler?.();
      return;
    }

    this.unbindContentResizeObserver();

    const bodyConstraints = this.prepareContentHeightStyles(doc);
    let declared: string[] | undefined;
    let constraintViewport: ContentHeightViewport | undefined;
    let probeReady = false;
    let probeDirty = true;
    let _resizeObserver: ResizeObserver | undefined;
    const debouncedResize = debounce(() => {
      // Ignore any pending debounced callbacks after the observer has been unbound/replaced.
      if (this._contentResizeObserver !== _resizeObserver) return;
      // Defer the DOM write to the next frame so mutating iframe.height here
      // doesn't re-trigger this same observation cycle (avoids the browser's
      // "ResizeObserver loop completed with undelivered notifications" warning).
      requestAnimationFrame(() => {
        if (this._contentResizeObserver !== _resizeObserver) return;
        const minHeight = BrowserUtilities.getHeight() - this.attributes.margin;
        const viewport: ContentHeightViewport = {
          height: minHeight,
          width: iframe.clientWidth,
          styles: doc.documentElement.style.cssText,
        };
        if (probeDirty) {
          probeReady = false;
          probeDirty = false;
          this.loadContentHeightProbe(
            iframe,
            doc,
            bodyConstraints,
            viewport,
            () => {
              probeReady = true;
              declared = undefined;
              debouncedResize.call(this);
            }
          );
          return;
        }
        const probe = this._contentHeightProbe;
        if (
          !probeReady ||
          !probe?.contentDocument?.body ||
          !probe.contentWindow
        )
          return;
        if (
          !declared ||
          constraintViewport?.height !== viewport.height ||
          constraintViewport?.width !== viewport.width ||
          constraintViewport?.styles !== viewport.styles
        ) {
          declared = this.resolveBodyHeightConstraints(
            probe,
            bodyConstraints,
            viewport
          );
          if (!declared) return;
          constraintViewport = viewport;
        }
        this.updateContentHeight(iframe, minHeight, bodyConstraints, declared);
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
        probeDirty = true;
        declared = undefined;
      }
      debouncedResize.call(this);
    };
    doc.addEventListener("load", this._contentHeightRefreshHandler, {
      capture: true,
    });
    body.addEventListener("toggle", debouncedResize, { capture: true });
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

  /** Restores a saved CSS value and priority on the original or supplied style. */
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

  /** Loads a script-free chapter copy in a hidden, sandboxed measurement iframe. */
  private loadContentHeightProbe(
    iframe: HTMLIFrameElement,
    doc: Document,
    bodyConstraints: BodyHeightConstraint[],
    viewport: ContentHeightViewport,
    onLoad: () => void
  ): void {
    const probe =
      this._contentHeightProbe ?? iframe.ownerDocument.createElement("iframe");
    this._contentHeightProbe = probe;
    probe.setAttribute("aria-hidden", "true");
    probe.setAttribute("sandbox", "allow-same-origin");
    probe.tabIndex = -1;
    probe.style.cssText =
      "position:fixed!important;left:-100000px!important;top:0!important;visibility:hidden!important;pointer-events:none!important;border:0!important;";
    probe.style.setProperty("width", viewport.width + "px", "important");
    probe.style.setProperty("height", viewport.height + "px", "important");

    const root = doc.documentElement.cloneNode(true) as HTMLElement;
    root.querySelectorAll("script").forEach((script) => script.remove());
    const base = iframe.ownerDocument.createElement("base");
    base.href = doc.baseURI;
    root.querySelector("head")?.prepend(base);
    const probeBody = root.querySelector("body") as HTMLElement;
    for (const constraint of bodyConstraints) {
      this.restoreHeightStyle(constraint, probeBody.style);
    }
    probeBody.style.setProperty("display", "none", "important");
    probe.onload = () => {
      if (this._contentHeightProbe !== probe) return;
      onLoad();
    };
    probe.srcdoc = "<!DOCTYPE html>\n" + root.outerHTML;
    if (!probe.isConnected) iframe.ownerDocument.body.appendChild(probe);
  }

  /** Resolves body constraints against the reader viewport before content sizing. */
  private resolveBodyHeightConstraints(
    probe: HTMLIFrameElement,
    bodyConstraints: BodyHeightConstraint[],
    viewport: ContentHeightViewport
  ): string[] | undefined {
    const doc = probe.contentDocument;
    const win = probe.contentWindow;
    if (!doc?.body || !win) return;

    for (const constraint of bodyConstraints) {
      if (constraint.applied === undefined) continue;
      this.restoreHeightStyle(constraint);
      constraint.applied = undefined;
    }
    doc.documentElement.style.cssText = viewport.styles;
    doc.documentElement.style.setProperty(
      "height",
      viewport.height + "px",
      "important"
    );
    probe.style.setProperty("width", viewport.width + "px", "important");
    probe.style.setProperty("height", viewport.height + "px", "important");
    const declared = bodyConstraints.map(({ property }) =>
      win.getComputedStyle(doc.body).getPropertyValue(property)
    );
    // Keep the body hidden to distinguish auto from a used pixel height.
    // Resolve remaining percentages with a separate reader-sized box.
    if (declared.some((value) => value.includes("%"))) {
      const measurement = doc.createElement("div");
      measurement.style.cssText =
        "all:initial!important;display:block!important;position:fixed!important;box-sizing:content-box!important;min-height:0!important;max-height:none!important;padding:0!important;border:0!important;";
      doc.documentElement.appendChild(measurement);
      for (const [index, value] of declared.entries()) {
        if (!value.includes("%")) continue;
        measurement.style.setProperty("height", value, "important");
        declared[index] = win.getComputedStyle(measurement).height;
      }
      measurement.remove();
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

  // paginated functions

  protected hasFixedScrollWidth: boolean = false;

  protected checkForFixedScrollWidth(): void {
    // Determine if the scroll width changes when the left position
    // changes. This differs across browsers and sometimes across
    // books in the same browser.
    let doc = this.iframe.contentDocument;
    if (doc) {
      const body = HTMLUtilities.findIframeElement(doc, "body");
      const originalScrollWidth = body?.scrollWidth;
      this.hasFixedScrollWidth = body?.scrollWidth === originalScrollWidth;
    }
  }

  async setSize(): Promise<void> {
    if (this.stopped) return;
    this.iframe.width = BrowserUtilities.getWidth() + "px";
    if (!this.scrollMode) {
      let doc = this.iframe.contentDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.style.height = this.height + "px";
      }
      this.iframe.height = this.height + "px";
    } else {
      this.bindContentResizeObserver(this.iframe);
      if (this._contentResizeBody) {
        await new Promise<void>((resolve) => {
          this._contentResizeWaiters.add(resolve);
        });
      }
    }
  }

  // TODO: if we changed the following functions to handle screen size (height and width) we can use it for both paginated and reflowable.
  // For example: getColumnWidth would be renamed to something that gives us either the offsetWidth when in paginated mode and the offsetHeight when in scroll mode. etc.
  // Since theses are the only 4 functions right now that are specifically used for paginated mode but gives us nothing for scroll mode, it would make sense to make them more universal

  /** Returns the total width of the columns that are currently
     positioned to the left of the iframe viewport. */
  private getLeftColumnsWidth(): number {
    return Math.round(this.scrollingElement.scrollLeft);
  }

  /** Returns the total width of the columns that are currently
     positioned to the right of the iframe viewport. */
  private getRightColumnsWidth(): number {
    const width = this.getColumnWidth();
    let rightWidth = this.scrollWidth - width;
    if (this.hasFixedScrollWidth) {
      // In some browsers (IE and Firefox with certain books),
      // scrollWidth doesn't change when some columns
      // are off to the left, so we need to subtract them.
      const leftWidth = this.getLeftColumnsWidth();
      rightWidth = Math.max(0, rightWidth - leftWidth);
    }
    return rightWidth;
  }

  /** Returns the width of one column. */
  private getColumnWidth(): number {
    return this.scrollingElement.clientWidth;
  }

  /** Shifts the columns so that the specified width is positioned
     to the left of the iframe viewport. */
  private setLeftColumnsWidth(width: number) {
    this.scrollingElement.scrollLeft = width;
  }

  get scrollingElement() {
    if (this.iframe.contentDocument?.scrollingElement) {
      return this.iframe.contentDocument?.scrollingElement;
    } else if (this.iframe.contentDocument?.body) {
      return this.iframe.contentDocument?.body;
    } else {
      // Note: this should never happen, but prevents any exceptions.
      // exception here could happen id the iframe s not loaded yet properly
      // but the scrolling element or body is accessed
      // for example, very fast next/previous resource changes
      return document.createElement("body");
    }
  }

  get scrollWidth() {
    const scrollWidth = this.scrollingElement?.scrollWidth;
    const width = this.getColumnWidth();
    // Subtract 1px before ceil to absorb sub-pixel rounding that
    // creates phantom pages (html/body scrollWidth off by 1-2px)
    const pages = Math.ceil((scrollWidth - 1) / width);
    return Math.max(1, pages) * width;
  }

  /**
   * In multi-column paginated mode, if the content produces an odd number
   * of CSS columns the last page will only show one column and navigation
   * may skip it. This injects an invisible spacer to force an even column
   * count so every page is full.
   */
  padOddColumns(): boolean {
    if (this.scrollMode) return false;

    const doc = this.iframe.contentDocument;
    if (!doc) return false;

    // If a spacer already exists, don't re-evaluate
    const existing = doc.getElementById("r2d2bc-column-spacer");
    if (existing) return false;

    const body = doc.body;
    if (!body) return false;

    const rawScrollWidth = body.scrollWidth;
    const viewportWidth = this.getColumnWidth();
    const remainder = rawScrollWidth % viewportWidth;

    // Only inject spacer when remainder is at least 25% of viewport —
    // an actual odd column is ~50% of viewport
    if (remainder > viewportWidth * 0.25) {
      const spacer = doc.createElement("div");
      spacer.id = "r2d2bc-column-spacer";
      spacer.style.breakBefore = "column";
      spacer.style.height = "100%";
      spacer.style.visibility = "hidden";
      body.appendChild(spacer);
      // Force synchronous reflow
      void body.scrollWidth;
      return true;
    }
    return false;
  }
}
