import { describe, expect, it } from 'vitest';

import type { FieldDefinition } from '@/types/objects';
import {
  serializeObjectDetail,
  serializeObjectSummary,
  serializeRecord,
  validateRecordFields,
  type ResolvedObject,
} from './custom-objects';
import { ApiError } from './respond';

const field = (name: string, required = false): FieldDefinition =>
  ({
    id: `id-${name}`,
    name,
    label: name.toUpperCase(),
    labelSingular: name,
    labelPlural: name,
    type: 'TEXT',
    required,
    position: 0,
    isActive: true,
    isSystem: false,
  }) as unknown as FieldDefinition;

const OBJECT: ResolvedObject = {
  row: {
    id: 'obj-1',
    name_singular: 'project',
    name_plural: 'projects',
    label_singular: 'Proyecto',
    label_plural: 'Proyectos',
    description: null,
    icon: 'Folder',
    default_view: 'TABLE',
    is_active: true,
    is_system: false,
  },
  id: 'obj-1',
  name: 'project',
  fields: [field('name', true), field('budget')],
};

function reason(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    return (err as ApiError).message;
  }
  throw new Error('expected a rejection, got none');
}

describe('validateRecordFields', () => {
  it('accepts a payload whose keys are all real field names', () => {
    expect(
      validateRecordFields(OBJECT, { name: 'Site', budget: 100 }, { partial: false })
    ).toEqual({ name: 'Site', budget: 100 });
  });

  it('rejects an unknown field and says what does exist', () => {
    // Silently dropping it would let an integration believe it is
    // writing data that goes nowhere.
    const message = reason(() =>
      validateRecordFields(OBJECT, { nmae: 'typo' }, { partial: false })
    );
    expect(message).toContain("'nmae'");
    expect(message).toContain('name, budget');
  });

  it('requires required fields on create', () => {
    expect(
      reason(() => validateRecordFields(OBJECT, { budget: 1 }, { partial: false }))
    ).toContain("'name' is required");
  });

  it('treats an empty string as absent for a required field', () => {
    expect(
      reason(() => validateRecordFields(OBJECT, { name: '' }, { partial: false }))
    ).toContain("'name' is required");
  });

  it('skips the required check on a patch', () => {
    // The stored row already satisfies it; a one-field patch must
    // not have to resend everything.
    expect(
      validateRecordFields(OBJECT, { budget: 5 }, { partial: true })
    ).toEqual({ budget: 5 });
  });

  it('still rejects unknown fields on a patch', () => {
    expect(
      reason(() => validateRecordFields(OBJECT, { nope: 1 }, { partial: true }))
    ).toContain("'nope'");
  });

  it('rejects a non-object payload', () => {
    for (const bad of [null, 'hi', 42, ['a']]) {
      expect(reason(() => validateRecordFields(OBJECT, bad, { partial: true }))).toContain(
        "'fields'"
      );
    }
  });

  it('explains itself when the object has no fields yet', () => {
    const empty: ResolvedObject = { ...OBJECT, fields: [] };
    expect(reason(() => validateRecordFields(empty, { a: 1 }, { partial: true }))).toContain(
      'no fields defined yet'
    );
  });
});

describe('serializers', () => {
  it('maps the storage column names onto the public names', () => {
    expect(serializeObjectSummary(OBJECT.row)).toEqual({
      id: 'obj-1',
      name: 'project',
      name_plural: 'projects',
      label: 'Proyecto',
      label_plural: 'Proyectos',
      description: null,
      icon: 'Folder',
      default_view: 'TABLE',
      is_active: true,
      is_system: false,
    });
  });

  it('defaults the icon and treats a missing is_active as active', () => {
    const row = { ...OBJECT.row, icon: null, is_active: undefined };
    const out = serializeObjectSummary(row);
    expect(out.icon).toBe('Folder');
    expect(out.is_active).toBe(true);
  });

  it('includes the fields in the detail shape', () => {
    const detail = serializeObjectDetail(OBJECT.row, OBJECT.fields);
    expect(detail.fields).toHaveLength(2);
    expect(detail.fields[0]).toMatchObject({ name: 'name', required: true });
    expect(detail.fields[1]).toMatchObject({ name: 'budget', required: false });
  });

  it('never returns a null field map for a record', () => {
    const out = serializeRecord(
      { id: 'r1', fields: null, created_at: 'a', updated_at: 'b' },
      'project'
    );
    expect(out.fields).toEqual({});
    expect(out.object).toBe('project');
  });
});
