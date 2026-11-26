import { Fragment, ReactNode } from "react";

const TOKEN_REGEX =
  /\^\{([^}]+)\}|_\{([^}]+)\}|<sup>([\s\S]*?)<\/sup>|<sub>([\s\S]*?)<\/sub>|([A-Za-z0-9)\]])\^(-?\d+|[a-zA-Z])(?![A-Za-z0-9_{])/gi;

export function hasFormattingMarkers(text: string): boolean {
  if (!text) return false;
  TOKEN_REGEX.lastIndex = 0;
  return TOKEN_REGEX.test(text);
}

export function stripFormattingMarkers(text: string): string {
  if (!text) return "";
  return text
    .replace(/\^\{([^}]+)\}/g, "$1")
    .replace(/_\{([^}]+)\}/g, "$1")
    .replace(/<\/?(?:sup|sub)>/gi, "")
    .replace(
      /([A-Za-z0-9)\]])\^(-?\d+|[a-zA-Z])(?![A-Za-z0-9_{])/g,
      "$1$2"
    );
}

interface FormattedTextProps {
  text: string;
}

/**
 * Safely renders inline superscripts (^{...}, ^2, <sup>...</sup>) and
 * subscripts (_{...}, <sub>...</sub>) as real React JSX elements without
 * raw HTML injection.
 */
export function FormattedText({ text }: FormattedTextProps) {
  if (!text) return null;

  TOKEN_REGEX.lastIndex = 0;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Fragment key={`t-${keyIdx++}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>
      );
    }

    if (match[1] !== undefined) {
      parts.push(
        <sup
          key={`sup-${keyIdx++}`}
          className="text-[0.68em] leading-none align-super font-semibold"
        >
          {match[1]}
        </sup>
      );
    } else if (match[2] !== undefined) {
      parts.push(
        <sub
          key={`sub-${keyIdx++}`}
          className="text-[0.68em] leading-none align-sub font-semibold"
        >
          {match[2]}
        </sub>
      );
    } else if (match[3] !== undefined) {
      parts.push(
        <sup
          key={`sup-${keyIdx++}`}
          className="text-[0.68em] leading-none align-super font-semibold"
        >
          {match[3]}
        </sup>
      );
    } else if (match[4] !== undefined) {
      parts.push(
        <sub
          key={`sub-${keyIdx++}`}
          className="text-[0.68em] leading-none align-sub font-semibold"
        >
          {match[4]}
        </sub>
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      parts.push(
        <Fragment key={`base-${keyIdx++}`}>{match[5]}</Fragment>
      );
      parts.push(
        <sup
          key={`sup-${keyIdx++}`}
          className="text-[0.68em] leading-none align-super font-semibold"
        >
          {match[6]}
        </sup>
      );
    }

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex === 0) {
    return <>{text}</>;
  }

  if (lastIndex < text.length) {
    parts.push(
      <Fragment key={`t-${keyIdx++}`}>{text.slice(lastIndex)}</Fragment>
    );
  }

  return <>{parts}</>;
}
