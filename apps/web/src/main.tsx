import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/query'
import { SessionProvider } from '@/features/auth/session'
import { AppRoutes } from '@/routes'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SessionProvider>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            border: '1px solid var(--color-border-strong)',
            borderRadius: '6px',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.875rem',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
)
