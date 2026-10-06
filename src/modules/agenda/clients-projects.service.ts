import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AgendaStore, requiredText, updateReturning } from './agenda-store.service';
import {
  CreateClientDto,
  CreateProjectDto,
  PageDto,
  UpdateClientDto,
  UpdateProjectDto,
  VersionDto,
} from './agenda.dto';

@Injectable()
export class ClientsProjectsService {
  constructor(private readonly store: AgendaStore) {}

  clients(query: PageDto) {
    const search = (query.search || '').trim().replace(/[\\%_]/g, '\\$&');
    return this.store.db.query(
      `SELECT *, count(*) OVER()::int AS "totalCount" FROM client
      WHERE ("archivedAt" IS NOT NULL) = $1 AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
      ORDER BY name, id LIMIT $3 OFFSET $4`,
      [query.archived === 'true', `%${search}%`, query.limit, (query.page - 1) * query.limit]
    );
  }

  async client(id: string) {
    const [client] = await this.store.db.query('SELECT * FROM client WHERE id = $1', [id]);
    if (!client) throw new NotFoundException('Cliente inexistente');
    return client;
  }

  createClient(actor: string, key: string, dto: CreateClientDto) {
    return this.store.write(actor, 'client.create', key, dto, async (m, _, requestId) => {
      const name = requiredText(dto.name, 'Nombre');
      const phone = dto.phone?.trim() || null,
        email = dto.email?.trim().toLowerCase() || null;
      if (!phone && !email) throw new BadRequestException('Indica teléfono o email');
      const [row] = await m.query(
        `INSERT INTO client (name,phone,email,"shortNote") VALUES ($1,$2,$3,$4) RETURNING *`,
        [name, phone, email, dto.shortNote?.trim() || null]
      );
      await this.store.audit(m, actor, 'client', row.id, 'create', null, row, requestId);
      return row;
    });
  }

  updateClient(actor: string, key: string, id: string, dto: UpdateClientDto) {
    return this.store.write(actor, `client.update:${id}`, key, dto, async (m, _, requestId) => {
      const [before] = await m.query('SELECT * FROM client WHERE id=$1 FOR UPDATE', [id]);
      this.store.checkVersion(before, dto.version);
      const name = dto.name === undefined ? before.name : requiredText(dto.name, 'Nombre');
      const phone = dto.phone === undefined ? before.phone : dto.phone?.trim() || null;
      const email = dto.email === undefined ? before.email : dto.email?.trim().toLowerCase() || null;
      if (!phone && !email) throw new BadRequestException('Indica teléfono o email');
      const note = dto.shortNote === undefined ? before.shortNote : dto.shortNote?.trim() || null;
      const after = await updateReturning(
        m,
        `UPDATE client SET name=$2,phone=$3,email=$4,"shortNote"=$5,
        version=version+1,"updatedAt"=now() WHERE id=$1 RETURNING *`,
        [id, name, phone, email, note]
      );
      await this.store.audit(m, actor, 'client', id, 'update', before, after, requestId);
      return after;
    });
  }

  archive(actor: string, key: string, kind: 'client' | 'project', id: string, dto: VersionDto) {
    return this.store.write(actor, `${kind}.archive:${id}`, key, dto, async (m, _, requestId) => {
      const table = kind === 'client' ? 'client' : 'tattoo_project';
      const [before] = await m.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
      this.store.checkVersion(before, dto.version);
      const conflicts = await m.query(
        `SELECT e.id,e."startAt",e."endAt" FROM schedule_entry e
        JOIN tattoo_project p ON p.id=e."projectId" WHERE ${kind === 'client' ? 'p."clientId"' : 'p.id'}=$1
        AND e.kind='session' AND e."sessionStatus" IN ('pending','confirmed') AND e."endAt">now()`,
        [id]
      );
      if (conflicts.length)
        throw new ConflictException({
          message: 'Cancela o finaliza las sesiones pendientes antes de archivar',
          conflicts,
        });
      const after = await updateReturning(
        m,
        `UPDATE ${table} SET "archivedAt"=coalesce("archivedAt",now()),version=version+1,"updatedAt"=now() WHERE id=$1 RETURNING *`,
        [id]
      );
      await this.store.audit(m, actor, kind, id, 'archive', before, after, requestId);
      return after;
    });
  }

  createProject(actor: string, key: string, dto: CreateProjectDto) {
    return this.store.write(actor, 'project.create', key, dto, async (m, _, requestId) => {
      const [client] = await m.query('SELECT * FROM client WHERE id=$1 FOR UPDATE', [dto.clientId]);
      if (!client) throw new NotFoundException('Cliente inexistente');
      if (client.archivedAt) throw new ConflictException('Cliente archivado');
      const [row] = await m.query(
        `INSERT INTO tattoo_project ("clientId",title,"briefDescription") VALUES ($1,$2,$3) RETURNING *`,
        [dto.clientId, requiredText(dto.title, 'Título'), dto.briefDescription?.trim() || null]
      );
      await this.store.audit(m, actor, 'project', row.id, 'create', null, row, requestId);
      return row;
    });
  }

  updateProject(actor: string, key: string, id: string, dto: UpdateProjectDto) {
    return this.store.write(actor, `project.update:${id}`, key, dto, async (m, _, requestId) => {
      const [before] = await m.query('SELECT * FROM tattoo_project WHERE id=$1 FOR UPDATE', [id]);
      this.store.checkVersion(before, dto.version);
      const after = await updateReturning(
        m,
        `UPDATE tattoo_project SET title=$2,"briefDescription"=$3,version=version+1,"updatedAt"=now() WHERE id=$1 RETURNING *`,
        [
          id,
          dto.title === undefined ? before.title : requiredText(dto.title, 'Título'),
          dto.briefDescription === undefined ? before.briefDescription : dto.briefDescription?.trim() || null,
        ]
      );
      await this.store.audit(m, actor, 'project', id, 'update', before, after, requestId);
      return after;
    });
  }

  async project(id: string) {
    // One snapshot keeps the project and its sessions consistent during concurrent changes.
    return this.store.db.transaction('REPEATABLE READ', async (m) => {
      const [project] = await m.query('SELECT * FROM tattoo_project WHERE id=$1', [id]);
      if (!project) throw new NotFoundException('Proyecto inexistente');
      const sessions = await m.query('SELECT * FROM schedule_entry WHERE "projectId"=$1 ORDER BY "startAt",id', [id]);
      return { ...project, sessions };
    });
  }

  projects(clientId: string, query: PageDto) {
    return this.store.db.query(
      `SELECT *,count(*) OVER()::int AS "totalCount" FROM tattoo_project
      WHERE "clientId"=$1 AND ("archivedAt" IS NOT NULL)=$2 ORDER BY "createdAt" DESC,id LIMIT $3 OFFSET $4`,
      [clientId, query.archived === 'true', query.limit, (query.page - 1) * query.limit]
    );
  }
}
