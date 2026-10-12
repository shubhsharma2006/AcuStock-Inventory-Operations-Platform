"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface GalleryImage {
  _id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
  altText?: string;
  uploadedAt?: string;
}

export interface ProductForGallery {
  _id: string;
  name: string;
  sku: string;
  gallery?: GalleryImage[];
}

interface ProductGalleryModalProps {
  product: ProductForGallery;
  onClose: () => void;
  onUpdated: () => void;
}

export default function ProductGalleryModal({ product, onClose, onUpdated }: ProductGalleryModalProps) {
  const [gallery, setGallery] = useState<GalleryImage[]>(product.gallery || []);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload mutation
  async function handleUpload() {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append("images", file));

      const res = await apiFetch<{ success: boolean; gallery: GalleryImage[] }>(
        `/api/items/${product._id}/images`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (res.gallery) {
        setGallery(res.gallery);
        setSelectedFiles([]);
        onUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload images");
    } finally {
      setUploading(false);
    }
  }

  // Set primary mutation
  const primaryMutation = useMutation({
    mutationFn: (imageId: string) => apiFetch<{ success: boolean; gallery: GalleryImage[] }>(
      `/api/items/${product._id}/images/${imageId}/primary`,
      { method: "PATCH" }
    ),
    onSuccess: (data) => {
      if (data.gallery) setGallery(data.gallery);
      onUpdated();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to set primary image")
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => apiFetch<{ success: boolean; gallery: GalleryImage[] }>(
      `/api/items/${product._id}/images/${imageId}`,
      { method: "DELETE" }
    ),
    onSuccess: (data) => {
      if (data.gallery) setGallery(data.gallery);
      onUpdated();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to delete image")
  });

  // Reorder mutation
  async function moveImage(currentIndex: number, targetIndex: number) {
    if (targetIndex < 0 || targetIndex >= gallery.length) return;
    const reordered = [...gallery];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setGallery(reordered);

    try {
      const order = reordered.map((img) => img._id);
      const res = await apiFetch<{ success: boolean; gallery: GalleryImage[] }>(
        `/api/items/${product._id}/images/reorder`,
        {
          method: "PATCH",
          body: JSON.stringify({ order })
        }
      );
      if (res.gallery) setGallery(res.gallery);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder images");
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 120,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16
    }}>
      <div style={{
        background: "#0b1424", border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 840,
        maxHeight: "90vh", overflowY: "auto"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#ecf3ff", margin: 0 }}>
              Product Image Gallery
            </h2>
            <p style={{ color: "#9bb0cb", fontSize: 12, marginTop: 4 }}>
              Product: <span style={{ color: "#5498ff", fontWeight: 600 }}>{product.name}</span> ({product.sku}) • {gallery.length}/20 images
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9bb0cb", fontSize: 18, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Upload Drop/Select Area */}
        <div style={{
          background: "rgba(15,23,42,0.6)", border: "1px dashed rgba(84,152,255,0.35)",
          borderRadius: 12, padding: "1.25rem", marginBottom: 20, textAlign: "center"
        }}>
          <input
            type="file"
            id="gallery-file-input"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => {
              if (e.target.files) setSelectedFiles(Array.from(e.target.files));
            }}
            style={{ display: "none" }}
          />
          <label
            htmlFor="gallery-file-input"
            style={{
              display: "inline-block", padding: "8px 18px", borderRadius: 8,
              background: "rgba(84,152,255,0.15)", border: "1px solid rgba(84,152,255,0.35)",
              color: "#5498ff", fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}
          >
            📁 Select Images to Upload
          </label>
          <span style={{ display: "block", color: "#9bb0cb", fontSize: 11, marginTop: 6 }}>
            Supports JPEG, PNG, WEBP, GIF (up to 5MB each, max 20 images total)
          </span>

          {selectedFiles.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#ecf3ff" }}>
                {selectedFiles.length} file(s) selected
              </span>
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{
                  padding: "6px 16px", borderRadius: 6, background: "rgba(52,211,153,0.85)",
                  border: "none", color: "#07111f", fontWeight: 700, fontSize: 12, cursor: "pointer",
                  opacity: uploading ? 0.6 : 1
                }}
              >
                {uploading ? "Uploading…" : "Upload Now"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div style={{
            background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.3)",
            borderRadius: 8, padding: "8px 14px", color: "#fb7185", fontSize: 12, marginBottom: 16
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Gallery Grid */}
        {gallery.length === 0 ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "#9bb0cb", fontSize: 13 }}>
            No images in gallery yet. Select files above to add product photos.
          </div>
        ) : (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14, marginBottom: 20
          }}>
            {gallery.map((img, idx) => (
              <div
                key={img._id || idx}
                style={{
                  background: "rgba(11,20,36,0.9)", border: img.isPrimary ? "2px solid #5498ff" : "1px solid rgba(148,163,184,0.15)",
                  borderRadius: 10, padding: 8, position: "relative", display: "flex", flexDirection: "column"
                }}
              >
                {/* Image Display */}
                <div style={{
                  width: "100%", height: 130, borderRadius: 6, overflow: "hidden",
                  background: "#050b14", display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.altText || product.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                    }}
                  />
                </div>

                {/* Primary Tag */}
                {img.isPrimary && (
                  <span style={{
                    position: "absolute", top: 12, left: 12,
                    background: "#2563eb", color: "#ffffff", padding: "2px 8px",
                    borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em"
                  }}>
                    PRIMARY
                  </span>
                )}

                {/* Card Controls */}
                <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => moveImage(idx, idx - 1)}
                      disabled={idx === 0}
                      title="Move Left"
                      style={{
                        padding: "3px 7px", borderRadius: 4, background: "rgba(148,163,184,0.1)",
                        border: "1px solid rgba(148,163,184,0.2)", color: "#ecf3ff", fontSize: 10,
                        cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.3 : 1
                      }}
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => moveImage(idx, idx + 1)}
                      disabled={idx === gallery.length - 1}
                      title="Move Right"
                      style={{
                        padding: "3px 7px", borderRadius: 4, background: "rgba(148,163,184,0.1)",
                        border: "1px solid rgba(148,163,184,0.2)", color: "#ecf3ff", fontSize: 10,
                        cursor: idx === gallery.length - 1 ? "not-allowed" : "pointer", opacity: idx === gallery.length - 1 ? 0.3 : 1
                      }}
                    >
                      ▶
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 4 }}>
                    {!img.isPrimary && (
                      <button
                        onClick={() => primaryMutation.mutate(img._id)}
                        disabled={primaryMutation.isPending}
                        title="Make Primary Image"
                        style={{
                          padding: "3px 8px", borderRadius: 4, background: "rgba(84,152,255,0.15)",
                          border: "1px solid rgba(84,152,255,0.35)", color: "#5498ff", fontSize: 10,
                          fontWeight: 600, cursor: "pointer"
                        }}
                      >
                        Set Main
                      </button>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(img._id)}
                      disabled={deleteMutation.isPending}
                      title="Delete Image"
                      style={{
                        padding: "3px 7px", borderRadius: 4, background: "rgba(251,113,133,0.15)",
                        border: "1px solid rgba(251,113,133,0.3)", color: "#fb7185", fontSize: 10,
                        cursor: "pointer"
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px", borderRadius: 8, background: "rgba(148,163,184,0.15)",
              border: "1px solid rgba(148,163,184,0.3)", color: "#ecf3ff", fontSize: 13,
              fontWeight: 600, cursor: "pointer"
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
