import { useState, type JSX } from 'react'
import type { AccountSummary, AccountsState, OAuthConfigInfo } from '../../../shared/types'
import { Icon } from './Icons'
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal } from './UI'

interface AccountsViewProps {
  accounts: AccountsState | null
  oauth: OAuthConfigInfo | null
  loginPending: boolean
  busy: boolean
  onSelect: (id: string) => void
  onAddOffline: (name: string) => Promise<void>
  onLoginMicrosoft: () => void
  onCancelLogin: () => void
  onRemove: (id: string) => void
  onSaveClientId: (clientId: string) => Promise<void>
}

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

function AccountAvatar({ account }: { account: AccountSummary }): JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`avatar avatar-lg ${account.type === 'microsoft' ? 'avatar-gold' : ''}`}>
      {!failed ? (
        <img
          src={`https://mc-heads.net/avatar/${encodeURIComponent(account.uuid)}/64`}
          alt={`Skin de ${account.name}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : account.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function AccountCard({
  account,
  selected,
  busy,
  onSelect,
  onRemove
}: {
  account: AccountSummary
  selected: boolean
  busy: boolean
  onSelect: () => void
  onRemove: () => void
}): JSX.Element {
  return (
    <div
      className={`account-card ${selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
    >
      <AccountAvatar account={account} />
      <div className="account-card-copy">
        <div className="account-card-name">
          <strong>{account.name}</strong>
          {selected ? <Badge tone="gold">Activa</Badge> : null}
          {account.needsReauth ? <Badge tone="warn">Reconectar</Badge> : null}
        </div>
        <span className="account-card-meta">
          {account.type === 'microsoft' ? 'Cuenta Microsoft' : 'Perfil offline'}
        </span>
        <span className="mono subtle account-uuid">{account.uuid}</span>
      </div>
      <div className="account-card-actions">
        {selected ? null : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
            }}
          >
            Usar
          </Button>
        )}
        <IconButton
          icon="trash"
          label={`Eliminar ${account.name}`}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        />
      </div>
    </div>
  )
}

export function AccountsView({
  accounts,
  oauth,
  loginPending,
  busy,
  onSelect,
  onAddOffline,
  onLoginMicrosoft,
  onCancelLogin,
  onRemove,
  onSaveClientId
}: AccountsViewProps): JSX.Element {
  const [offlineName, setOfflineName] = useState('')
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [clientId, setClientId] = useState(oauth?.clientId ?? '')
  const [editClientId, setEditClientId] = useState(false)
  const [savingClientId, setSavingClientId] = useState(false)
  const [clientIdError, setClientIdError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<AccountSummary | null>(null)

  const list = accounts?.accounts ?? []
  const selectedId = accounts?.selectedId ?? null

  const handleAddOffline = async (): Promise<void> => {
    const name = offlineName.trim()
    if (!NAME_PATTERN.test(name)) {
      setOfflineError('Usa entre 3 y 16 caracteres: letras, números o guion bajo.')
      return
    }
    setOfflineError(null)
    setAdding(true)
    try {
      await onAddOffline(name)
      setOfflineName('')
    } catch {
      // El launcher muestra el error
    } finally {
      setAdding(false)
    }
  }

  const handleSaveClientId = async (): Promise<void> => {
    const value = clientId.trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      setClientIdError('Introduce el GUID de la aplicación registrada en Microsoft Entra.')
      return
    }
    setClientIdError(null)
    setSavingClientId(true)
    try {
      await onSaveClientId(value)
      setEditClientId(false)
    } catch {
      // El launcher muestra el error
    } finally {
      setSavingClientId(false)
    }
  }

  const copyRedirect = async (): Promise<void> => {
    if (!oauth) return
    try {
      await navigator.clipboard.writeText(oauth.redirectUri)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="accounts-view">
      <Card
        title="Tus cuentas"
        subtitle="La cuenta activa se usa para iniciar Minecraft"
        action={<Badge tone="neutral">{list.length} {list.length === 1 ? 'cuenta' : 'cuentas'}</Badge>}
      >
        {list.length === 0 ? (
          <EmptyState
            icon="users"
            title="Aún no hay cuentas"
            description="Añade una cuenta de Microsoft o crea un perfil offline para empezar."
          />
        ) : (
          <div className="account-list">
            {list.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                selected={account.id === selectedId}
                busy={busy}
                onSelect={() => onSelect(account.id)}
                onRemove={() => setPendingRemove(account)}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="accounts-grid">
        <Card
          title="Cuenta Microsoft"
          subtitle="Perfil premium, skins y multijugador oficial"
          action={<Icon name="microsoft" size={20} />}
        >
          {!oauth ? (
            <p className="muted-copy">Comprobando configuración de Microsoft...</p>
          ) : oauth.configured && !editClientId ? (
            <div className="stack">
              <div className="notice notice-ok">
                <Icon name="shield" size={18} />
                <span>Client ID configurado. Al volver del navegador, espera a que Odissey valide tu perfil de Minecraft.</span>
              </div>
              {loginPending ? (
                <div className="stack-sm">
                  <div className="waiting-box">
                    <span className="spinner" aria-hidden="true" />
                    <div>
                      <strong>Esperando a Microsoft...</strong>
                      <span>Completa el inicio de sesión en el navegador y vuelve aquí.</span>
                    </div>
                  </div>
                  <Button variant="ghost" onClick={onCancelLogin}>Cancelar inicio de sesión</Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  icon="microsoft"
                  onClick={onLoginMicrosoft}
                  disabled={busy}
                  full
                >
                  Iniciar sesión con Microsoft
                </Button>
              )}
              <p className="field-hint">
                Odissey Client nunca recibe tu contraseña: la autenticación ocurre en
                login.microsoftonline.com y solo se guardan los tokens cifrados del sistema.
              </p>
              <button className="link-btn align-start" onClick={() => setEditClientId(true)}>
                Cambiar Client ID
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="notice notice-warn">
                <Icon name="info" size={18} />
                <span>
                  El inicio de sesión requiere una aplicación propia en Microsoft Entra. Sin este
                  paso, Microsoft no permite autenticar terceros.
                </span>
              </div>
              <Field
                label="Client ID de la aplicación"
                htmlFor="client-id"
                hint="GUID que aparece en la aplicación registrada, sección Información general."
              >
                <input
                  id="client-id"
                  className="input"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  spellCheck={false}
                />
              </Field>
              {clientIdError ? <p className="field-error">{clientIdError}</p> : null}
              <div className="row-actions">
                <Button
                  variant="primary"
                  loading={savingClientId}
                  onClick={() => void handleSaveClientId()}
                >
                  Guardar Client ID
                </Button>
                {editClientId ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditClientId(false)
                      setClientId(oauth?.clientId ?? '')
                      setClientIdError(null)
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
              <div className="redirect-box">
                <div>
                  <span className="redirect-label">URI que debes registrar en Entra</span>
                  <code>{oauth.redirectUri}</code>
                </div>
                <IconButton
                  icon={copied ? 'check' : 'copy'}
                  label="Copiar URI de redirección"
                  onClick={() => void copyRedirect()}
                />
              </div>
              <ol className="setup-steps">
                <li>Registra Odissey en Microsoft Entra y elige cuentas personales de Microsoft.</li>
                <li>En Autenticación, registra exactamente esta URI de retorno en la plataforma de tu aplicación: {oauth.redirectUri}</li>
                <li>Pega aquí el Application (client) ID. No crees ni compartas un secreto.</li>
              </ol>
            </div>
          )}
        </Card>

        <Card
          title="Perfil offline"
          subtitle="Para jugar en local y LAN sin cuenta premium"
          action={<Icon name="gamepad" size={20} />}
        >
          <div className="stack">
            <Field
              label="Nombre de jugador"
              htmlFor="offline-name"
              hint="Entre 3 y 16 caracteres. Debe coincidir con el nombre que uses en tus mundos."
            >
              <input
                id="offline-name"
                className="input"
                value={offlineName}
                maxLength={16}
                onChange={(event) => setOfflineName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddOffline()
                }}
                placeholder="TuNombre"
                spellCheck={false}
              />
            </Field>
            {offlineError ? <p className="field-error">{offlineError}</p> : null}
            <Button
              variant="secondary"
              icon="plus"
              loading={adding}
              onClick={() => void handleAddOffline()}
              disabled={busy}
              full
            >
              Crear perfil offline
            </Button>
            <p className="field-hint">
              Un perfil offline no valida la cuenta en los servidores de Mojang. Úsalo solo en
              mundos locales o servidores configurados en modo offline.
            </p>
          </div>
        </Card>
      </div>

      <Modal
        open={Boolean(pendingRemove)}
        title="Eliminar cuenta"
        onClose={() => setPendingRemove(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingRemove(null)}>Cancelar</Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                if (pendingRemove) onRemove(pendingRemove.id)
                setPendingRemove(null)
              }}
            >
              Eliminar cuenta
            </Button>
          </>
        }
      >
        <p className="modal-copy">
          Se eliminará <strong>{pendingRemove?.name}</strong> de este equipo. Los mundos y archivos
          del juego no se borrarán. Si es una cuenta Microsoft, tendrás que iniciar sesión de nuevo
          para volver a añadirla.
        </p>
      </Modal>
    </div>
  )
}
