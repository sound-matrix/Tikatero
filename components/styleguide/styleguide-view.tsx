"use client";

import Image from "next/image";
import { ImageUpload } from "@/components/image-upload";
import { useState } from "react";
import { adminNav, consoleNav } from "@/lib/nav";
import { cities } from "@/lib/cities";
import { SideNav } from "@/components/layout/side-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PriceTag } from "@/components/ui/price-tag";
import { Select } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { formatIst } from "@/lib/format";

const swatches = [
  { name: "Coral", hex: "#F25C54", className: "bg-coral" },
  { name: "Orange", hex: "#FF9F43", className: "bg-orange" },
  { name: "Ink", hex: "#2D3142", className: "bg-ink" },
  { name: "Muted", hex: "#5C6170", className: "bg-muted" },
  { name: "Line", hex: "#E7E8EC", className: "bg-line" },
  { name: "Soft", hex: "#F7F8FA", className: "bg-soft" },
  { name: "Teal", hex: "#0E9F9A", className: "bg-teal" },
  { name: "Gold", hex: "#C9A227", className: "bg-gold" },
  { name: "Success", hex: "#1F9D55", className: "bg-success" },
  { name: "Danger", hex: "#D93025", className: "bg-danger" },
] as const;

const steps = [
  { label: "Basics" },
  { label: "Venue" },
  { label: "Tickets" },
  { label: "Review" },
] as const;

const sampleInstant = "2026-11-07T12:30:00.000Z";

export function StyleguideView() {
  const [step, setStep] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const { push } = useToast();

  return (
    <div className="space-y-12">
      <section aria-label="Media upload component">
        <h2 className="mb-4 text-2xl font-bold">Media upload</h2>
        <p className="mb-4 text-muted">
          Component preview. Uploading needs an organiser account and an existing event.
        </p>
        <ImageUpload
          kind="poster"
          entityId="00000000-0000-4000-8000-000000000000"
          label="Event poster"
        />
      </section>
      <section>
        <h2 className="text-2xl font-bold">Colour</h2>
        <p className="mt-2 max-w-2xl text-muted">
          White page. Coral to orange for the main action. Teal means trusted or secure. Gold means
          VIP.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {swatches.map((swatch) => (
            <li key={swatch.name} className="overflow-hidden rounded-2xl border border-line">
              <div className={`h-14 ${swatch.className}`} />
              <p className="px-3 py-2 text-sm font-semibold">
                {swatch.name}
                <span className="mt-0.5 block font-normal text-muted">{swatch.hex}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Logo</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card>
            <p className="mb-3 text-sm font-semibold text-muted">Wordmark</p>
            <Image
              src="/brand/tikatero-logo.svg"
              alt="Tikatero wordmark"
              width={195}
              height={52}
              unoptimized
              className="h-[52px] w-auto"
            />
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold text-muted">Horizontal file</p>
            <Image
              src="/brand/tikatero-logo-horizontal.jpg"
              alt="Tikatero horizontal logo"
              width={320}
              height={120}
              className="h-24 w-auto"
            />
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold text-muted">App icon</p>
            <Image
              src="/brand/tikatero-app-icon.jpg"
              alt="Tikatero app icon"
              width={96}
              height={96}
              className="h-24 w-24"
            />
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Buttons</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="primary">Book now</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="trust">Secure payment</Button>
          <Button variant="vip">VIP lounge</Button>
          <Button variant="primary" disabled>
            Sold out
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Badges</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Badge variant="verified">Verified</Badge>
          <Badge variant="vip">VIP</Badge>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Card</h2>
        <Card className="mt-4 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">Diwali night</h3>
            <Badge variant="verified">Verified organiser</Badge>
            <Badge variant="vip">VIP</Badge>
          </div>
          <p className="mt-2 text-muted">{formatIst(sampleInstant)} · Mumbai</p>
          <PriceTag paise={100000} className="mt-3" />
          <p className="mt-2 text-sm text-muted">No hidden fees. What you see is what you pay.</p>
        </Card>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Price</h2>
        <p className="mt-2 text-muted">
          Money is stored as paise. 100000 paise is shown as ₹1,000, including GST.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <PriceTag paise={100000} />
          <PriceTag paise={79900} />
          <PriceTag paise={0} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Fields</h2>
        <div className="mt-4 grid max-w-xl gap-4">
          <Input label="Full name" name="name" placeholder="Your name" autoComplete="name" />
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            error="Enter an email address."
          />
          <Select
            label="City"
            name="city"
            options={[
              { value: "", label: "Choose a city" },
              ...cities.map((city) => ({ value: city, label: city })),
            ]}
          />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Stepper</h2>
        <div className="mt-4">
          <Stepper steps={steps} current={step} onChange={setStep} />
          <p className="mt-3 text-muted">You are on {steps[step]?.label}.</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Modal and toast</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open a note
          </Button>
          <Button variant="trust" onClick={() => push("Saved. This is only a preview.", "success")}>
            Show a toast
          </Button>
        </div>
        <Modal open={modalOpen} title="A short note" onClose={() => setModalOpen(false)}>
          <p>This window is part of the design system. Close it when you are done.</p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Done
            </Button>
          </div>
        </Modal>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Empty state</h2>
        <div className="mt-4">
          <EmptyState
            title="No tickets yet"
            description="When you book an event, the ticket will show up here."
            action={
              <Button href="/" variant="primary">
                Find events
              </Button>
            }
          />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Organiser console</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <SideNav title="Organiser console" items={consoleNav} current="/console" />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Admin</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <SideNav title="Tikatero admin" items={adminNav} current="/admin" />
        </div>
      </section>
    </div>
  );
}
