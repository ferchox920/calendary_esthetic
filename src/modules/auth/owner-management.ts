import { DataSource } from 'typeorm';
import { isEmail } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { OwnerAccount } from './entities/owner-account.entity';

export async function manageOwner(dataSource: DataSource, mode: 'init' | 'reset', email: string, password: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!isEmail(normalizedEmail || '') || normalizedEmail.length > 254)
    throw new Error('OWNER_EMAIL must be a valid email');
  const size = Buffer.byteLength(password || '');
  if (size < 12 || size > 72 || password.includes('replace-with')) {
    throw new Error('OWNER_PASSWORD must contain 12 to 72 bytes and cannot be a placeholder');
  }
  const owners = dataSource.getRepository(OwnerAccount);
  if (mode === 'init') {
    if (await owners.count()) throw new Error('Owner already exists. Use the assisted recovery procedure.');
    await owners.save(
      owners.create({ email: normalizedEmail, name: 'Gabriela', passwordHash: await bcrypt.hash(password, 12) })
    );
    return;
  }
  const owner = await owners.findOneBy({ email: normalizedEmail });
  if (!owner) throw new Error('Owner not found; recovery requires the existing email');
  await owners
    .createQueryBuilder()
    .update()
    .set({ passwordHash: await bcrypt.hash(password, 12), active: true, sessionVersion: () => '"sessionVersion" + 1' })
    .where('id = :id', { id: owner.id })
    .execute();
}
