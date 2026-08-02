import { beforeEach, describe, expect, it } from 'vitest';
import {
  confirmarCopiaSeguridad,
  hayCopiaSeguridadPendiente,
  marcarCopiaSeguridadPendiente,
} from '@/storage/backup';

describe('aviso de copia de seguridad', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('solo queda pendiente después de modificar datos', () => {
    expect(hayCopiaSeguridadPendiente()).toBe(false);

    marcarCopiaSeguridadPendiente();

    expect(hayCopiaSeguridadPendiente()).toBe(true);
  });

  it('descartar el aviso al exportar conserva el estado como respaldado', () => {
    marcarCopiaSeguridadPendiente();
    confirmarCopiaSeguridad();

    expect(hayCopiaSeguridadPendiente()).toBe(false);
  });
});
