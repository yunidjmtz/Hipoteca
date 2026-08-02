const CLAVE_COPIA_PENDIENTE = 'hipotecas-copia-pendiente-v1';

/** Indica que existen cambios desde la última exportación de respaldo. */
export function marcarCopiaSeguridadPendiente(): void {
  try {
    localStorage.setItem(CLAVE_COPIA_PENDIENTE, 'si');
  } catch {
    // El aviso es una ayuda adicional; la app sigue funcionando aunque el navegador bloquee storage.
  }
}

/** Confirma que el usuario acaba de descargar una copia de sus datos. */
export function confirmarCopiaSeguridad(): void {
  try {
    localStorage.removeItem(CLAVE_COPIA_PENDIENTE);
  } catch {
    // No se puede persistir el estado del aviso, pero tampoco debe bloquear la descarga.
  }
}

export function hayCopiaSeguridadPendiente(): boolean {
  try {
    return localStorage.getItem(CLAVE_COPIA_PENDIENTE) === 'si';
  } catch {
    return false;
  }
}
