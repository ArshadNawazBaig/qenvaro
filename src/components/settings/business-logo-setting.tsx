"use client";

import { ImageIcon, LoaderCircle, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brand } from "@/config/brand";
import {
  BUSINESS_LOGO_MIME_TYPES,
  MAX_BUSINESS_LOGO_BYTES,
  type BusinessLogo,
} from "@/modules/settings/schemas";

interface LogoResponse {
  ok?: boolean;
  message?: string;
}

export function BusinessLogoSetting({
  tenantSlug,
  businessName,
  logo,
  expectedVersion,
  disabled,
  uploadEnabled,
}: {
  tenantSlug: string;
  businessName: string;
  logo: BusinessLogo | null;
  expectedVersion: number;
  disabled: boolean;
  uploadEnabled: boolean;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [operation, setOperation] = React.useState<"upload" | "remove" | null>(
    null,
  );
  const endpoint = `/api/app/${encodeURIComponent(tenantSlug)}/settings/business/logo`;

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operation || disabled || !uploadEnabled) return;
    const formData = new FormData(event.currentTarget);
    const image = formData.get("logo");
    if (!(image instanceof File) || image.size === 0) {
      toast.error("Choose a business logo to upload.");
      return;
    }
    if (image.size > MAX_BUSINESS_LOGO_BYTES) {
      toast.error("Choose a logo smaller than 2 MB.");
      return;
    }
    if (!(BUSINESS_LOGO_MIME_TYPES as readonly string[]).includes(image.type)) {
      toast.error("Use a JPEG, PNG, WebP, or AVIF image.");
      return;
    }
    formData.set("expectedVersion", String(expectedVersion));
    setOperation("upload");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as LogoResponse;
      if (!response.ok)
        throw new Error(result.message ?? "The logo could not be uploaded.");
      toast.success(result.message ?? "Business logo updated.");
      formRef.current?.reset();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The logo could not be uploaded.",
      );
    } finally {
      setOperation(null);
    }
  }

  async function remove() {
    if (operation || disabled || !logo) return;
    setOperation("remove");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion }),
      });
      const result = (await response.json()) as LogoResponse;
      if (!response.ok)
        throw new Error(result.message ?? "The logo could not be removed.");
      toast.success(result.message ?? "Business logo removed.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The logo could not be removed.",
      );
    } finally {
      setOperation(null);
    }
  }

  const pending = operation !== null;
  return (
    <section
      aria-labelledby="business-logo-title"
      className="bg-muted/25 rounded-xl border p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={
            logo
              ? "bg-card relative flex size-14 shrink-0 overflow-hidden rounded-xl border"
              : "bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
          }
        >
          {logo ? (
            <Image
              src={logo.secureUrl}
              alt={`${businessName} logo`}
              fill
              sizes="56px"
              className="object-contain p-1.5"
            />
          ) : (
            brand.logoMark
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="business-logo-title" className="text-sm font-semibold">
            Business logo
          </h3>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {logo
              ? "Displayed in the workspace sidebar."
              : `${brand.name} branding is displayed until you add a logo.`}
          </p>
        </div>
        {logo && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive size-8"
            onClick={remove}
            disabled={disabled || pending}
            aria-label="Remove business logo"
          >
            {operation === "remove" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Trash2 />
            )}
          </Button>
        )}
      </div>
      <form
        ref={formRef}
        onSubmit={upload}
        className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <Input
          name="logo"
          type="file"
          accept={BUSINESS_LOGO_MIME_TYPES.join(",")}
          required
          disabled={disabled || pending || !uploadEnabled}
          aria-label="Business logo file"
          className="h-auto min-w-0 py-1.5"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={disabled || pending || !uploadEnabled}
        >
          {operation === "upload" ? (
            <LoaderCircle className="animate-spin" />
          ) : logo ? (
            <ImageIcon />
          ) : (
            <Upload />
          )}
          {operation === "upload"
            ? "Uploading…"
            : logo
              ? "Replace logo"
              : "Upload logo"}
        </Button>
      </form>
      <p className="text-muted-foreground mt-2 text-[11px] leading-5">
        Square PNG, JPEG, WebP, or AVIF recommended. Maximum 2 MB.
        {!uploadEnabled && " Connect Cloudinary to enable uploads."}
      </p>
    </section>
  );
}
