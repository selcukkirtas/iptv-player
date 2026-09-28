import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePicker } from './ProfilePicker';
import { renderWithProviders } from '../test/utils';
import * as client from '../api/client';
import type { PickerUser } from '../api/types';

vi.mock('../api/client');

const PROFILES: PickerUser[] = [
  { id: 'u-parent', name: 'Parent', color: '#4f8cff', hasPin: true },
  { id: 'u-kid', name: 'Kid', color: '#5fd38d', hasPin: false },
];

beforeEach(() => {
  vi.mocked(client.getProfiles).mockResolvedValue(PROFILES);
  vi.mocked(client.login).mockResolvedValue({
    user: { id: 'u-kid', name: 'Kid' },
  });
});

afterEach(() => vi.clearAllMocks());

describe('ProfilePicker', () => {
  it('signs straight in to a profile with no PIN', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    renderWithProviders(<ProfilePicker onSignedIn={onSignedIn} />);

    expect(await screen.findByText('Parent')).toBeInTheDocument();
    await user.click(screen.getByText('Kid'));

    expect(client.login).toHaveBeenCalledWith('u-kid', '');
    expect(onSignedIn).toHaveBeenCalled();
  });

  it('asks for the PIN before signing in to a locked profile', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    renderWithProviders(<ProfilePicker onSignedIn={onSignedIn} />);

    await user.click(await screen.findByText('Parent'));

    // Choosing the profile must not sign anyone in on its own.
    expect(client.login).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();

    await user.type(screen.getByLabelText('PIN'), '1234');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(client.login).toHaveBeenCalledWith('u-parent', '1234');
  });

  it('shows the server’s rejection and stays on the PIN prompt', async () => {
    vi.mocked(client.login).mockRejectedValue(new Error('Incorrect PIN'));
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    renderWithProviders(<ProfilePicker onSignedIn={onSignedIn} />);

    await user.click(await screen.findByText('Parent'));
    await user.type(await screen.findByLabelText('PIN'), '0000');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect PIN');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('never offers profile management from the sign-in screen', async () => {
    renderWithProviders(<ProfilePicker onSignedIn={vi.fn()} />);
    await screen.findByText('Parent');
    expect(
      screen.queryByRole('button', { name: /manage profiles/i }),
    ).not.toBeInTheDocument();
  });
});
