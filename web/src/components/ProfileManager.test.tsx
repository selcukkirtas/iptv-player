import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ProfileManager } from './ProfileManager';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useUsers: vi.fn(),
  useCreateUser: vi.fn(),
  useUpdateUser: vi.fn(),
  useDeleteUser: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock('../api/hooks', () => ({
  useUsers: mocks.useUsers,
  useCreateUser: mocks.useCreateUser,
  useUpdateUser: mocks.useUpdateUser,
  useDeleteUser: mocks.useDeleteUser,
}));

vi.mock('../api/client', () => ({
  getAllChannelGroups: vi.fn(),
  getAllMovieGroups: vi.fn(),
  getAllSeriesGroups: vi.fn(),
}));

beforeEach(() => {
  mocks.useUsers.mockReturnValue({
    data: [],
    isLoading: false,
  });
  mocks.useCreateUser.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
  mocks.useUpdateUser.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
  mocks.useDeleteUser.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
  mocks.useQuery.mockReturnValue({ data: [] });
});

afterEach(() => vi.clearAllMocks());

describe('ProfileManager', () => {
  it('auto-unlocks when there are no profiles yet', async () => {
    render(<ProfileManager />);

    expect(
      await screen.findByRole('button', { name: '+ Add profile' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
  });

  it('creates the first profile without a bootstrapping PIN', async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue(undefined);
    mocks.useCreateUser.mockReturnValue({
      isPending: false,
      mutateAsync: create,
    });

    render(<ProfileManager />);

    await user.click(
      await screen.findByRole('button', { name: '+ Add profile' }),
    );
    await user.type(screen.getByLabelText('Name'), 'Family');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(create).toHaveBeenCalledWith({
      name: 'Family',
      color: '#4f8cff',
      kids: false,
      hideAdult: false,
      disabled: false,
      allowed: { channels: null, movies: null, series: null },
    });
  });

  it('suspends a profile from the list without opening the editor', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    mocks.useUpdateUser.mockReturnValue({
      isPending: false,
      mutateAsync: update,
    });
    mocks.useUsers.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: 'u1',
          name: 'Kid',
          allowed: { channels: null, movies: null, series: null },
          createdAt: 'now',
        },
      ],
    });

    render(<ProfileManager />);
    await screen.findByText('Kid');

    await user.click(screen.getByRole('button', { name: 'Disable' }));

    expect(update).toHaveBeenCalledWith({
      id: 'u1',
      input: { disabled: true },
    });
  });

  it('offers to restore an already-suspended profile', async () => {
    mocks.useUsers.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: 'u1',
          name: 'Kid',
          disabled: true,
          allowed: { channels: null, movies: null, series: null },
          createdAt: 'now',
        },
      ],
    });

    render(<ProfileManager />);
    await screen.findByText('Kid');
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });
});
