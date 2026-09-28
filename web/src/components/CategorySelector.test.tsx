import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CategorySelector } from './CategorySelector';

const GROUPS = ['TR ➾ HEVC', 'TR ➾ SPORTS', 'DE ➾ Classic', 'FOR ADULTS ➾ 4K'];

describe('CategorySelector', () => {
  it('groups categories by their provider prefix', () => {
    render(
      <CategorySelector
        label="Channels"
        allGroups={GROUPS}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('TR')).toBeInTheDocument();
    expect(screen.getByText('DE')).toBeInTheDocument();
    expect(screen.getByText('FOR ADULTS')).toBeInTheDocument();
  });

  it('the prefix header selects every category under that prefix at once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategorySelector
        label="Channels"
        allGroups={GROUPS}
        value={[]}
        onChange={onChange}
      />,
    );

    // The header's accessible name carries the group heading too.
    await user.click(screen.getByLabelText(/^Select all TR\b/));

    expect(onChange).toHaveBeenCalledWith(['TR ➾ HEVC', 'TR ➾ SPORTS']);
  });

  it('labels each prefix with its country, or with what it contains', () => {
    render(
      <CategorySelector
        label="Channels"
        allGroups={GROUPS}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    // A real country code is named (wording is locale-dependent, so assert it
    // is neither the bare code nor a listing of the group's categories).
    const tr = screen.getByLabelText(/^Select all TR\b/);
    const heading = tr.closest('summary')?.querySelector('.prefix-title');
    expect(heading?.textContent).toBeTruthy();
    expect(heading?.textContent).not.toContain('HEVC');

    // A prefix that is not a country falls back to its own categories.
    const adults = screen.getByLabelText(/^Select all FOR ADULTS\b/);
    expect(
      adults.closest('summary')?.querySelector('.prefix-title')?.textContent,
    ).toBe('4K');
  });

  it('shows the provider’s full category name in the list', () => {
    render(
      <CategorySelector
        label="Channels"
        allGroups={GROUPS}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('TR ➾ HEVC')).toBeInTheDocument();
    expect(screen.getByLabelText('DE ➾ Classic')).toBeInTheDocument();
  });

  it('"unrestricted" toggles between null and an explicit list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategorySelector
        label="Movies"
        allGroups={GROUPS}
        value={null}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText('All categories (unrestricted)'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
