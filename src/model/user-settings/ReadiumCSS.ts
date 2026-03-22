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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

export class ReadiumCSS {
  static readonly FONT_SIZE_REF = "fontSize";
  static readonly FONT_FAMILY_REF = "fontFamily";
  static readonly FONT_OVERRIDE_REF = "fontOverride";
  static readonly APPEARANCE_REF = "appearance";
  static readonly SCROLL_REF = "scroll";
  static readonly ADVANCED_SETTINGS_REF = "advancedSettings";
  static readonly TEXT_ALIGNMENT_REF = "textAlign";
  static readonly COLUMN_COUNT_REF = "colCount";
  static readonly DIRECTION_REF = "direction";
  static readonly WORD_SPACING_REF = "wordSpacing";
  static readonly LETTER_SPACING_REF = "letterSpacing";
  static readonly PAGE_MARGINS_REF = "pageMargins";
  static readonly LINE_HEIGHT_REF = "lineHeight";
  static readonly BODY_HYPHENS_REF = "bodyHyphens";
  static readonly PARA_SPACING_REF = "paraSpacing";
  static readonly PARA_INDENT_REF = "paraIndent";
  static readonly TYPE_SCALE_REF = "typeScale";
  static readonly BACKGROUND_COLOR_REF = "backgroundColor";
  static readonly TEXT_COLOR_REF = "textColor";

  static readonly FONT_SIZE_KEY = "--USER__" + ReadiumCSS.FONT_SIZE_REF;
  static readonly FONT_FAMILY_KEY = "--USER__" + ReadiumCSS.FONT_FAMILY_REF;
  static readonly FONT_OVERRIDE_KEY = "--USER__" + ReadiumCSS.FONT_OVERRIDE_REF;
  static readonly APPEARANCE_KEY = "--USER__" + ReadiumCSS.APPEARANCE_REF;
  static readonly SCROLL_KEY = "--USER__" + ReadiumCSS.SCROLL_REF;
  static readonly ADVANCED_SETTINGS_KEY =
    "--USER__" + ReadiumCSS.ADVANCED_SETTINGS_REF;
  static readonly TEXT_ALIGNMENT_KEY =
    "--USER__" + ReadiumCSS.TEXT_ALIGNMENT_REF;
  static readonly COLUMN_COUNT_KEY = "--USER__" + ReadiumCSS.COLUMN_COUNT_REF;
  static readonly DIRECTION_KEY = "--USER__" + ReadiumCSS.DIRECTION_REF;
  static readonly WORD_SPACING_KEY = "--USER__" + ReadiumCSS.WORD_SPACING_REF;
  static readonly LETTER_SPACING_KEY =
    "--USER__" + ReadiumCSS.LETTER_SPACING_REF;
  static readonly PAGE_MARGINS_KEY = "--USER__" + ReadiumCSS.PAGE_MARGINS_REF;
  static readonly LINE_HEIGHT_KEY = "--USER__" + ReadiumCSS.LINE_HEIGHT_REF;
  static readonly BODY_HYPHENS_KEY = "--USER__" + ReadiumCSS.BODY_HYPHENS_REF;
  static readonly PARA_SPACING_KEY = "--USER__" + ReadiumCSS.PARA_SPACING_REF;
  static readonly PARA_INDENT_KEY = "--USER__" + ReadiumCSS.PARA_INDENT_REF;
  static readonly TYPE_SCALE_KEY = "--USER__" + ReadiumCSS.TYPE_SCALE_REF;
  static readonly BACKGROUND_COLOR_KEY =
    "--USER__" + ReadiumCSS.BACKGROUND_COLOR_REF;
  static readonly TEXT_COLOR_KEY = "--USER__" + ReadiumCSS.TEXT_COLOR_REF;
}
