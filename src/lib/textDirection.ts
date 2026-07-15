const RTL_RANGE = /[֐-׿؀-ۿݐ-ݿ]/g;
const LTR_RANGE = /[A-Za-z]/g;

export type TextDirection = "ltr" | "rtl";

export function detectDirection(text: string): TextDirection {
  const rtlCount = text.match(RTL_RANGE)?.length ?? 0;
  const ltrCount = text.match(LTR_RANGE)?.length ?? 0;
  return rtlCount > ltrCount ? "rtl" : "ltr";
}
