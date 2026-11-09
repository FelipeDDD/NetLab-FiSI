import { Fragment, type ReactNode } from 'react';

/** Mark explicit command examples; route output, IPs and table cells keep their colors. */
export function TutorialCommand({ children }: { children: string }) {
  return <code className="guided-command">{children}</code>;
}

// Only known command phrases are recognized in translated prose. Arguments in
// instructional examples use TutorialCommand explicitly; no HTML is interpreted.
export function TutorialText({ children }: { children: string }): ReactNode {
  return children.split(/(\bip (?:address (?:add|del)|addr|route(?: (?:add default|add|replace|del))?|link set)\b|\bping (?:-c \d+ )?\d{1,3}(?:\.\d{1,3}){3}\b)/g)
    .map((part, index) => <Fragment key={index}>{index % 2 ? <TutorialCommand>{part}</TutorialCommand> : part}</Fragment>);
}
