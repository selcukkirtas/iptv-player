import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isAdultGroup } from './adult';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { hashSecret, verifySecret } from '../common/secret-hash';
import { UsersRepository } from './users.repository';
import { AllowedGroups, Section, User } from './users.types';

/** Predicate: whether a category name is visible to a (resolved) user. */
export type GroupPredicate = (group: string | undefined) => boolean;

/** Normalize a (possibly partial) allowed-groups input to a full record. */
function normalizeAllowed(input?: Partial<AllowedGroups>): AllowedGroups {
  return {
    channels: input?.channels ?? null,
    movies: input?.movies ?? null,
    series: input?.series ?? null,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  list(): User[] {
    return this.repo.findAll();
  }

  getById(id: string): User {
    const user = this.repo.findById(id);
    if (!user) throw new NotFoundException(`Unknown user: ${id}`);
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const user: User = {
      id: randomUUID(),
      name: dto.name,
      color: dto.color,
      kids: dto.kids ?? false,
      hideAdult: dto.hideAdult ?? false,
      disabled: dto.disabled ?? false,
      pinHash: dto.pin ? await hashSecret(dto.pin) : undefined,
      allowed: normalizeAllowed(dto.allowed),
      createdAt: new Date().toISOString(),
    };
    await this.repo.add(user);
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const patch: Partial<User> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.kids !== undefined) patch.kids = dto.kids;
    if (dto.hideAdult !== undefined) patch.hideAdult = dto.hideAdult;
    if (dto.disabled !== undefined) patch.disabled = dto.disabled;
    if (dto.allowed !== undefined)
      patch.allowed = normalizeAllowed(dto.allowed);
    // An empty-string pin clears it; a non-empty one sets it; absent keeps it.
    if (dto.pin !== undefined) {
      patch.pinHash = dto.pin ? await hashSecret(dto.pin) : undefined;
    }

    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFoundException(`Unknown user: ${id}`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const removed = await this.repo.remove(id);
    if (!removed) throw new NotFoundException(`Unknown user: ${id}`);
  }

  /**
   * Verify a profile's PIN. Profiles without a PIN accept any input; a disabled
   * profile accepts none, so suspending someone takes effect even if they know
   * the PIN.
   */
  async verifyPin(id: string, pin: string): Promise<boolean> {
    const user = this.repo.findById(id);
    if (!user) throw new NotFoundException(`Unknown user: ${id}`);
    if (user.disabled) return false;
    if (!user.pinHash) return true;
    return verifySecret(pin, user.pinHash);
  }

  /**
   * Build a visibility predicate for a section, resolving the user once. A kids
   * profile additionally hides age-restricted categories on top of `allowed`.
   *
   * No id at all means an internal/admin listing and stays unrestricted; an id
   * that names no profile is a stale or forged one and sees nothing, so a bad
   * id can never widen access.
   */
  groupFilter(userId: string | undefined, section: Section): GroupPredicate {
    if (!userId) return () => true;
    const user = this.repo.findById(userId);
    if (!user || user.disabled) return () => false;
    const list = user.allowed[section];
    const allowed = list ? new Set(list) : null;
    // A kids profile always hides them; any profile may opt in on its own.
    const noAdult = user.kids === true || user.hideAdult === true;
    return (group) => {
      if (noAdult && isAdultGroup(group)) return false;
      if (allowed) return group !== undefined && allowed.has(group);
      return true;
    };
  }

  /** Filter a list of category names down to those the user may see. */
  filterGroups(
    userId: string | undefined,
    section: Section,
    groups: string[],
  ): string[] {
    return groups.filter(this.groupFilter(userId, section));
  }

  /** Whether a single category is visible to the user. */
  isAllowed(
    userId: string | undefined,
    section: Section,
    group: string | undefined,
  ): boolean {
    return this.groupFilter(userId, section)(group);
  }
}
