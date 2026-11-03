"use client";

import {
  CaretDownIcon,
  SignInIcon,
  SignOutIcon,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { DogDaysIcon } from "~/components/DogDaysIcon";
import { TermSelector } from "~/components/TermSelector";
import { ThemeSwitcher } from "~/components/ThemeSwitcher";
import { Button } from "~/components/ui/Button";
import { UserAvatar } from "~/components/ui/UserAvatar";
import signIn from "~/lib/signIn";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import NavigationLink from "./NavigationLink";
import * as Dropdown from "@radix-ui/react-dropdown-menu";

export function Navbar() {
  const { user, isLoading } = useSession();

  return (
    <header className="border-t-primary-strong border-b-edge bg-surface sticky top-0 left-0 z-40 border-t-2 border-b">
      <nav className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-4 md:px-6">
        {/* The mark flows in the text run — `h-[0.799em] w-auto align-baseline`
            stands its calendar body on the baseline at Alan Sans cap height,
            the same lockup the platform's project cards use. */}
        <Link
          href="/"
          className="font-display text-foreground shrink-0 text-xl font-semibold whitespace-nowrap transition-opacity hover:opacity-80"
        >
          <DogDaysIcon className="mr-2 inline-block h-[0.799em] w-auto align-baseline max-[400px]:mr-0 max-[400px]:h-6 max-[400px]:align-middle" />
          <span className="max-[400px]:sr-only">DogDays</span>
        </Link>

        <div className="flex min-w-0 flex-1 justify-start">
          <TermSelector />
        </div>

        <ul className="flex shrink-0 items-center gap-1">
          <NavigationLink href="/courses">Courses</NavigationLink>

          <NavigationLink href="/plans">Plans</NavigationLink>

          <li>
            <ThemeSwitcher />
          </li>

          {isLoading ? (
            <li>
              <div className="bg-surface-muted h-8 w-24 animate-pulse rounded-lg" />
            </li>
          ) : user ? (
            <li>
              <Dropdown.Root>
                <Dropdown.Trigger className="hover:bg-surface-muted data-[state=open]:bg-surface-muted flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-2xl transition-colors" aria-label="Account name">
                  <UserAvatar user={user}/>
                  <CaretDownIcon weight="bold" className="text-muted text-xs" />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content
                    className="border-edge-strong bg-surface z-50 flex min-w-40 flex-col rounded-lg border py-1.5 text-sm shadow-xl"
                    align="end"
                    sideOffset={6}
                  >
                    <button
                      className="text-accent hover:bg-primary-soft flex items-center gap-3 py-1.5 pr-6 pl-3 transition-colors"
                      type="button"
                      onClick={() => void supabase.auth.signOut()}
                    >
                      <SignOutIcon />
                      Sign Out
                    </button>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            </li>
          ) : (
            <li className="pl-1">
              <Button size="sm" onClick={signIn}>
                Sign In <SignInIcon weight="bold" />
              </Button>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
