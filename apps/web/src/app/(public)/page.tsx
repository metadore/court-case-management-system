"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold text-blue-900">TPT Court</h1>
          <nav className="flex items-center gap-4">
            <Link href="/search" className="text-sm font-medium text-gray-600 hover:text-blue-700">
              Search Cases
            </Link>
            <Link href="/efile" className="text-sm font-medium text-gray-600 hover:text-blue-700">
              File a Case
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-blue-700">
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-5xl font-bold tracking-tight text-gray-900">
            Modern Court Case Management
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            An open-source ERP platform for judges, lawyers, clerks, and the public. Manage cases,
            documents, hearings, and payments with ease.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/efile"
              className="rounded-lg bg-green-600 px-6 py-3 text-base font-medium text-white hover:bg-green-700"
            >
              File a Case Online
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700"
            >
              Get Started
            </Link>
            <Link
              href="/search"
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
            >
              Search Public Cases
            </Link>
          </div>
        </div>

        {/* E-filing CTA banner */}
        <div className="mt-16 rounded-xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-green-900">
            Self-Represented (Pro Se) Litigant?
          </h3>
          <p className="mt-2 text-sm text-green-700">
            File your case directly through our online portal — no account required.
            A non-refundable $50 filing fee applies.
          </p>
          <Link
            href="/efile"
            className="mt-4 inline-block rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            Start Your E-Filing
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Case Management</h3>
            <p className="mt-2 text-sm text-gray-600">
              File, track, and manage cases with automatic case numbering, party management, and status tracking.
            </p>
          </div>

          <div className="rounded-xl border bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Hearing Scheduling</h3>
            <p className="mt-2 text-sm text-gray-600">
              Schedule hearings, manage courtrooms, and get calendar views for judges and clerks.
            </p>
          </div>

          <div className="rounded-xl border bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Payments & Fees</h3>
            <p className="mt-2 text-sm text-gray-600">
              Integrated Stripe payments for filing fees, fines, bail bonds, and more.
            </p>
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-200">
              <svg className="h-6 w-6 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Online E-Filing</h3>
            <p className="mt-2 text-sm text-gray-600">
              Pro se litigants can file cases online and pay the filing fee without needing a court account.
            </p>
            <Link
              href="/efile"
              className="mt-4 inline-block text-sm font-medium text-green-700 hover:underline"
            >
              File now &rarr;
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t bg-white py-8">
        <div className="mx-auto max-w-7xl px-6 text-center text-sm text-gray-500">
          TPT Court &mdash; Open Source Court ERP Platform
        </div>
      </footer>
    </div>
  );
}