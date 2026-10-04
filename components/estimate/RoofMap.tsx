"use client";

// Google Maps satellite view with plane markers at each Solar API segment center.
// Markers only: never plane outlines or hip lines (CLAUDE.md). Google's attribution and logo are
// left exactly as the Maps JS API draws them.
import { useEffect, useRef, useState } from "react";
import type { LatLng, Segment } from "@/lib/api/types";
import { loadMapsLibrary } from "@/lib/google/maps-loader";

type Status = "loading" | "ready" | "error";

const MAX_ZOOM = 21;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Marker DOM: white pill, letter, pitch in chalk blue, arrow rotated by azimuth (downhill). */
function markerElement(seg: Segment): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "plane-marker";
  div.setAttribute("aria-hidden", "true");

  const letter = document.createElement("span");
  letter.className = "plane-marker-letter";
  letter.textContent = seg.letter;
  const pitch = document.createElement("span");
  pitch.className = "plane-marker-pitch";
  pitch.textContent = seg.pitch;
  div.append(letter, pitch);

  if (seg.compass !== null) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "-8 -8 16 16");
    svg.setAttribute("class", "plane-marker-arrow");
    const path = document.createElementNS(SVG_NS, "path");
    // Drawn pointing north (up); the map is north-up with no tilt or heading.
    path.setAttribute("d", "M0 6 V-6 M-4 -2 L0 -6 L4 -2");
    path.setAttribute("transform", `rotate(${seg.azimuth})`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#22262A");
    path.setAttribute("stroke-width", "1.9");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    div.appendChild(svg);
  }
  return div;
}

export function RoofMap({
  apiKey,
  segments,
  buildingCenter,
}: {
  apiKey: string | null;
  segments: Segment[];
  buildingCenter: LatLng | null;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>(apiKey ? "loading" : "error");

  useEffect(() => {
    const el = canvas.current;
    if (!apiKey || !el) return;
    let cancelled = false;
    const overlays: google.maps.OverlayView[] = [];

    loadMapsLibrary(apiKey)
      .then((maps) => {
        if (cancelled) return;
        const placed = segments.filter((s): s is Segment & { center: LatLng } => s.center !== null);
        const first = buildingCenter ?? placed[0]?.center;
        if (!first) {
          setStatus("error");
          return;
        }
        const map = new maps.Map(el, {
          center: { lat: first.latitude, lng: first.longitude },
          zoom: 20,
          maxZoom: MAX_ZOOM,
          mapTypeId: "satellite",
          tilt: 0,
          heading: 0,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: false,
          gestureHandling: "cooperative",
          clickableIcons: false,
        });

        if (placed.length > 1) {
          const bounds = new google.maps.LatLngBounds();
          for (const s of placed) bounds.extend({ lat: s.center.latitude, lng: s.center.longitude });
          // Just enough room for half a marker at the edges, so the roof fills the map.
          const narrow = el.clientWidth < 500;
          map.fitBounds(
            bounds,
            narrow ? { top: 22, bottom: 22, left: 34, right: 34 } : { top: 24, bottom: 24, left: 52, right: 52 },
          );
        }

        class PlaneMarker extends maps.OverlayView {
          private div: HTMLDivElement | null = null;
          constructor(private readonly seg: Segment & { center: LatLng }) {
            super();
          }
          onAdd() {
            this.div = markerElement(this.seg);
            this.getPanes()?.overlayLayer.appendChild(this.div);
          }
          draw() {
            const projection = this.getProjection();
            if (!this.div || !projection) return;
            const p = projection.fromLatLngToDivPixel(
              new google.maps.LatLng(this.seg.center.latitude, this.seg.center.longitude),
            );
            if (!p) return;
            this.div.style.left = `${p.x}px`;
            this.div.style.top = `${p.y}px`;
          }
          onRemove() {
            this.div?.remove();
            this.div = null;
          }
        }

        for (const s of placed) {
          const overlay = new PlaneMarker(s);
          overlay.setMap(map);
          overlays.push(overlay);
        }
        google.maps.event.addListenerOnce(map, "idle", () => {
          if (!cancelled) setStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      for (const o of overlays) o.setMap(null);
    };
  }, [apiKey, segments, buildingCenter]);

  return (
    <div className="roof-map" role="region" aria-label="Satellite map of your roof. Plane letters match the table.">
      <div ref={canvas} className="roof-map-canvas" />
      {status === "loading" && (
        <p className="roof-map-status" aria-live="polite">
          Loading satellite map…
        </p>
      )}
      {status === "error" && (
        <p className="roof-map-status" role="status">
          The satellite map couldn&apos;t load. Your measurements are in the table.
        </p>
      )}
    </div>
  );
}
