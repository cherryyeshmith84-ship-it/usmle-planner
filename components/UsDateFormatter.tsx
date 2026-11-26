"use client";

import { useEffect } from "react";

/**
 * Site-wide US date format. Wherever a page prints a raw database date such
 * as "2026-11-13", this shows it as "11/13/2026" (month / day / year)
 * instead. It runs once on load and again whenever the page changes, so it
 * covers every page (current and future) without editing each one.
 *
 * It only rewrites visible text. Date pickers, inputs, textareas, code
 * blocks and anything marked data-no-date-format are left alone.
 */

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);

function toUs(text: string): string {
  return text.replace(ISO_DATE, (match: string, y: string, mo: string, d: string) => {
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return match;
    return `${mo}/${d}/${y}`;
  });
}

function fixText(node: Text) {
  const value = node.nodeValue;
  if (!value || value.indexOf("-") === -1) return;
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return;
  if (parent.closest("[contenteditable='true'],[data-no-date-format]")) return;
  const next = toUs(value);
  if (next !== value) node.nodeValue = next;
}

function handle(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    fixText(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    fixText(current as Text);
    current = walker.nextNode();
  }
}

export default function UsDateFormatter() {
  useEffect(() => {
    handle(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          fixText(record.target as Text);
        } else {
          record.addedNodes.forEach(handle);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
