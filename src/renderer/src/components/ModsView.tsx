import type { JSX } from 'react'
import { Icon } from './Icons'
import { Button, Card, EmptyState } from './UI'

interface ModsViewProps {
  onOpenVersions: () => void
}

export function ModsView({ onOpenVersions }: ModsViewProps): JSX.Element {
  return (
    <div className="mods-view">
      <Card>
        <EmptyState
          icon="puzzle"
          title="Mods y perfiles, en la siguiente etapa"
          description="La base está preparada, pero esta versión se centra en lanzar Minecraft de forma fiable. No mostramos botones que todavía no funcionan."
          action={<Button icon="versions" onClick={onOpenVersions}>Gestionar versiones</Button>}
        />
      </Card>

      <Card title="Qué incluye ahora mismo" subtitle="Funciones reales, sin promesas vacías">
        <ul className="feature-list">
          <li>
            <span className="stat-icon"><Icon name="check" size={16} /></span>
            <span>
              <strong>Instalación verificada</strong>
              <small>Cliente, librerías y recursos con comprobación SHA1 y caché local.</small>
            </span>
          </li>
          <li>
            <span className="stat-icon"><Icon name="check" size={16} /></span>
            <span>
              <strong>Cuentas Microsoft y offline</strong>
              <small>Sesiones premium mediante OAuth con PKCE y tokens cifrados por el sistema.</small>
            </span>
          </li>
          <li>
            <span className="stat-icon"><Icon name="check" size={16} /></span>
            <span>
              <strong>Control de Java y memoria</strong>
              <small>Detección automática, ruta personalizada y argumentos JVM validados.</small>
            </span>
          </li>
          <li>
            <span className="stat-icon"><Icon name="clock" size={16} /></span>
            <span>
              <strong>Mods, Forge y Fabric</strong>
              <small>Planificado. Requiere resolución de dependencias y perfiles aislados por instancia.</small>
            </span>
          </li>
        </ul>
      </Card>
    </div>
  )
}
