import "server-only";
import { render, toPlainText } from "react-email";
import { createEmail } from "./templates";
import type { TemplateData, TemplateName } from "./types";

export async function renderEmail<K extends TemplateName>(
  template: K,
  data: TemplateData[K],
  siteUrl: string,
) {
  const { subject, element } = createEmail(template, data, siteUrl);
  const html = await render(element);
  return { subject, html, text: toPlainText(html) };
}
