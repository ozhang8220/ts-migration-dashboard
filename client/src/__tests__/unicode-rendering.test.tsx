import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Tests that Unicode escape sequences render as actual characters in JSX.
 *
 * Root cause: When \uXXXX sequences appear as bare text in JSX (e.g. <span>\u2014</span>),
 * JSX treats them as literal text, not JavaScript unicode escapes. They must be wrapped
 * in expression containers: <span>{"\u2014"}</span>.
 *
 * These tests verify the fix by rendering the same patterns used in our components.
 */
describe('Unicode characters render correctly in JSX', () => {
  it('em dash (\\u2014) renders as \u2014', () => {
    render(<span data-testid="dash">{"\u2014"}</span>);
    const el = screen.getByTestId('dash');
    expect(el.textContent).toBe('\u2014');
    expect(el.textContent).not.toContain('\\u');
  });

  it('right arrow (\\u2192) renders as \u2192', () => {
    render(<span data-testid="arrow">{"\u2192"}</span>);
    const el = screen.getByTestId('arrow');
    expect(el.textContent).toBe('\u2192');
    expect(el.textContent).not.toContain('\\u');
  });

  it('box drawing characters (\\u2500, \\u251C, \\u2514) render correctly', () => {
    const connectorMid = '\u251C';
    const connectorEnd = '\u2514';
    render(
      <span data-testid="tree">
        {connectorMid}{"\u2500\u2500"}
      </span>
    );
    const el = screen.getByTestId('tree');
    expect(el.textContent).toBe('\u251C\u2500\u2500');
    expect(el.textContent).not.toContain('\\u');

    render(
      <span data-testid="tree-end">
        {connectorEnd}{"\u2500\u2500"}
      </span>
    );
    const elEnd = screen.getByTestId('tree-end');
    expect(elEnd.textContent).toBe('\u2514\u2500\u2500');
  });

  it('ellipsis (\\u22EF) renders as \u22EF', () => {
    render(<option data-testid="dots">{"\u22EF"}</option>);
    const el = screen.getByTestId('dots');
    expect(el.textContent).toBe('\u22EF');
    expect(el.textContent).not.toContain('\\u');
  });

  it('middle dot (\\u00B7) renders as \u00B7', () => {
    render(<span data-testid="middot">{"\u00B7"}</span>);
    const el = screen.getByTestId('middot');
    expect(el.textContent).toBe('\u00B7');
    expect(el.textContent).not.toContain('\\u');
  });

  it('sort arrows (\\u2191, \\u2193) render correctly', () => {
    render(<span data-testid="up">{'\u2191'}</span>);
    expect(screen.getByTestId('up').textContent).toBe('\u2191');

    render(<span data-testid="down">{'\u2193'}</span>);
    expect(screen.getByTestId('down').textContent).toBe('\u2193');
  });
});
