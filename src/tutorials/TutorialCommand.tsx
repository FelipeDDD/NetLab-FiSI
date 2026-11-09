import { Fragment, type ReactNode } from 'react';

const programs = new Set(['ip', 'ping', 'arp', 'traceroute', 'tracert', 'ipconfig', 'ifconfig', 'netstat', 'nslookup', 'route']);
const ipSyntax = new Set(['address', 'addr', 'route', 'link', 'neigh', 'add', 'del', 'delete', 'replace', 'show', 'list', 'flush', 'set', 'get', 'up', 'down', 'via', 'dev', 'default']);

/** Format presentation only: parameters and placeholders never inherit amber. */
export function TutorialCommand({ children }: { children: string }) {
  let program = '';
  return <code className="guided-command">{(children.match(/<[^>\n]*>|\n|[^\S\n]+|[^\s<]+|</g) ?? []).map((token, index) => {
    if (token === '\n') program = '';
    const root = !program && programs.has(token);
    if (root) program = token;
    const syntax = root || !!program && (/^--?(?:[a-zA-Z][\w-]*|[46])$/.test(token) || program === 'ip' && ipSyntax.has(token));
    return syntax ? <span className="guided-command-syntax" key={index}>{token}</span> : <Fragment key={index}>{token}</Fragment>;
  })}</code>;
}

// Limit prose matching to known command phrases and technical arguments. Ordinary
// explanations and routing-table output are not treated as commands or HTML.
const argument = String.raw`(?:<[^<>\n]+>(?:\/<[^<>\n]+>)?|\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|(?:eth|wlan|en)\d+|--?[a-zA-Z][\w-]*|\d+|via|dev|default|up|down)`;
const proseCommand = new RegExp(String.raw`(\bip (?:-[46] )?(?:address(?: (?:add|del))?|addr|route(?: (?:add|replace|del|show|list|get))?|link set|neigh)\b(?:[ \t]+${argument})*|\bping\b(?:[ \t]+${argument})*)`, 'g');
export function TutorialText({ children }: { children: string }): ReactNode {
  return children.split(proseCommand)
    .map((part, index) => <Fragment key={index}>{index % 2 ? <TutorialCommand>{part}</TutorialCommand> : part}</Fragment>);
}
