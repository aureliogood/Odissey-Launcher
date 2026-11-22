import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ScreenshotItem } from '../../../shared/types'
import { Icon } from './Icons'
import { Badge, Button, Card, IconButton, Modal, Spinner } from './UI'

interface ScreenshotsViewProps {
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function ScreenshotsView({ notify }: ScreenshotsViewProps): JSX.Element {
  const [items, setItems] = useState<ScreenshotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ name: string; data: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await window.launcher.listScreenshots())
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudieron leer las capturas', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (path: string, action: 'openScreenshot' | 'copyScreenshot'): Promise<void> => {
    if (busyPath) return
    setBusyPath(path)
    try {
      await window.launcher[action](path)
      notify(action === 'copyScreenshot' ? 'Captura copiada al portapapeles' : 'Captura abierta', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo completar la acción', 'error')
    } finally {
      setBusyPath(null)
    }
  }

  const openFolder = async (): Promise<void> => {
    try {
      await window.launcher.openScreenshotFolder()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo abrir la carpeta', 'error')
    }
  }

  const showPreview = async (item: ScreenshotItem): Promise<void> => {
    setPreviewLoading(item.path)
    try {
      setPreview({ name: item.name, data: await window.launcher.getScreenshotData(item.path) })
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo abrir la captura', 'error')
    } finally {
      setPreviewLoading(null)
    }
  }

  const remove = async (item: ScreenshotItem): Promise<void> => {
    if (!window.confirm(`¿Eliminar la captura “${item.name}”?`)) return
    setBusyPath(item.path)
    try {
      await window.launcher.deleteScreenshot(item.path)
      setItems((current) => current.filter((candidate) => candidate.path !== item.path))
      if (preview?.name === item.name) setPreview(null)
      notify('Captura eliminada', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo eliminar la captura', 'error')
    } finally {
      setBusyPath(null)
    }
  }

  return (
    <div className="screenshots-view">
      <section className="screenshots-hero">
        <div className="screenshots-hero-icon"><Icon name="image" size={25} /></div>
        <div>
          <span className="eyebrow">Galería local</span>
          <h2>Capturas de Minecraft</h2>
          <p>Imágenes del perfil seleccionado, organizadas de la más reciente a la más antigua.</p>
        </div>
        <div className="screenshots-hero-actions">
          <Button icon="folder" onClick={() => void openFolder()}>Abrir carpeta</Button>
          <Button variant="primary" icon="refresh" loading={loading} onClick={() => void refresh()}>Actualizar</Button>
        </div>
      </section>

      {loading && items.length === 0 ? (
        <Card><div className="screenshots-empty"><Spinner label="Buscando capturas..." /></div></Card>
      ) : items.length === 0 ? (
        <Card>
          <div className="screenshots-empty">
            <Icon name="image" size={30} />
            <h3>Aún no hay capturas</h3>
            <p>Cuando hagas una captura en Minecraft aparecerá aquí. Puedes abrir la carpeta para verla.</p>
            <Button icon="folder" onClick={() => void openFolder()}>Abrir carpeta de capturas</Button>
          </div>
        </Card>
      ) : (
        <section className="screenshot-grid" aria-label="Capturas disponibles">
          {items.map((item) => (
            <article className="screenshot-card" key={item.path}>
              <button
                className="screenshot-preview"
                onClick={() => void showPreview(item)}
                title={`Ver a pantalla completa: ${item.name}`}
                disabled={previewLoading === item.path}
              >
                <img src={item.thumbnail} alt={item.name} loading="lazy" />
              </button>
              <div className="screenshot-meta">
                <strong title={item.name}>{item.name}</strong>
                <span>{new Date(item.modifiedAt).toLocaleString()} · {formatBytes(item.sizeBytes)}</span>
              </div>
              <div className="screenshot-actions">
                <Button size="sm" icon="image" loading={previewLoading === item.path} onClick={() => void showPreview(item)}>Ver</Button>
                <Button
                  size="sm"
                  icon="copy"
                  loading={busyPath === item.path}
                  onClick={() => void run(item.path, 'copyScreenshot')}
                >Copiar</Button>
                <Button size="sm" variant="ghost" icon="external" onClick={() => void run(item.path, 'openScreenshot')}>Abrir</Button>
                <IconButton icon="trash" label={`Eliminar ${item.name}`} disabled={busyPath !== null} onClick={() => void remove(item)} />
                <Badge tone="info">PNG / JPG</Badge>
              </div>
            </article>
          ))}
        </section>
      )}

      <Modal
        open={Boolean(preview)}
        title={preview?.name ?? 'Captura de Minecraft'}
        onClose={() => setPreview(null)}
      >
        {preview ? <img className="screenshot-full-image" src={preview.data} alt={preview.name} /> : null}
      </Modal>
    </div>
  )
}
