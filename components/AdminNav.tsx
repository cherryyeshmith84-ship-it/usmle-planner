        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold bg-brand-900/40 text-brand-300 rounded-full px-2 py-1">
            Admin
          </span>
          {/* New-student-signup notifications land here (see
              app/auth/callback/route.ts) - admin pages have their own
              sidebar (AdminNav) instead of the shared AppShell/TopHeader
              every other page uses, so the bell needs to live here too.
              align="left" keeps the dropdown from opening off the left
              edge of the screen - see the comment on NotificationsBell's
              align prop for why. */}
          <NotificationsBell align="left" />
