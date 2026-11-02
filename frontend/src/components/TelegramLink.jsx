export const OFFICIAL_TELEGRAM_URL = 'https://t.me/cricedge_online'
export const ADMIN_TELEGRAM_URL = 'https://t.me/cricedgeonline'

export function TelegramIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.4 3.6 18.1 20c-.2 1.2-.9 1.5-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.5 13.4.6 11.9c-1.1-.4-1.1-1.1.2-1.6L20 2.9c.9-.3 1.7.2 1.4.7Z" />
    </svg>
  )
}

export default function TelegramLink({ className = '', children, ...props }) {
  return <a href={OFFICIAL_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={className} {...props}>{children}</a>
}

export function AdminTelegramLink({ children, ...props }) {
  return <a href={ADMIN_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
}
