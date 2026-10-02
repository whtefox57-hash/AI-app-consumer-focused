"use client";

import { useState } from "react";
import type { CommunityNetwork } from "@/lib/community-types";

/** The graph shows visible networks; edges mean shared declared topics, never inferred friendships. */
export default function CommunityGraph({
  networks,
  selected,
  onSelect,
}: {
  networks: CommunityNetwork[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const [depth, setDepth] = useState(false);
  const [angle, setAngle] = useState(0);
  const nodes = networks.slice(0, 24).map((network, index, list) => {
    const theta = index * 2.399963;
    const radius = 22 + Math.sqrt(index / Math.max(list.length, 1)) * 100;
    return {
      network,
      x: 160 + Math.cos(theta) * radius,
      y: 95 + Math.sin(theta) * radius * 0.64,
      z: Math.sin(index * 1.8) * 50,
    };
  });
  const edges = nodes.flatMap((a, i) =>
    nodes
      .slice(i + 1)
      .filter((b) =>
        a.network.topics.some((t) =>
          b.network.topics.some((v) => v.toLowerCase() === t.toLowerCase()),
        ),
      )
      .map((b) => ({ a, b })),
  );
  return (
    <div className="cm-graph">
      <div className="cm-graph-toolbar">
        <span>Shared interests</span>
        <button
          type="button"
          aria-pressed={depth}
          onClick={() => setDepth(!depth)}
        >
          {depth ? "2D view" : "Explore in 3D"}
        </button>
      </div>
      {!nodes.length ? (
        <div className="cm-graph-empty">
          <span className="cm-graph-orbit" />
          <p>Your network constellation starts here.</p>
          <small>Create or join a network to explore it.</small>
        </div>
      ) : (
        <div
          className={`cm-graph-stage ${depth ? "is-3d" : ""}`}
          style={{ perspective: depth ? "650px" : undefined }}
        >
          <div
            className="cm-graph-space"
            style={{
              transform: depth
                ? `rotateX(35deg) rotateY(${angle}deg)`
                : undefined,
            }}
          >
            <svg
              viewBox="0 0 320 190"
              role="img"
              aria-label="Network graph. Lines connect networks with shared declared interests."
            >
              {edges.map(({ a, b }) => (
                <line
                  key={`${a.network.id}-${b.network.id}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="rgba(126,219,180,.35)"
                  strokeWidth="1"
                />
              ))}
            </svg>
            {nodes.map(({ network, x, y, z }, index) => (
              <button
                type="button"
                key={network.id}
                className={`cm-graph-node ${selected === network.id ? "selected" : ""}`}
                style={
                  {
                    left: `${x / 3.2}%`,
                    top: `${y / 1.9}%`,
                    transform: `translate(-50%,-50%) ${depth ? `translateZ(${z}px)` : ""}`,
                    "--node-color": [
                      "#89e3af",
                      "#bca0ff",
                      "#73c6ff",
                      "#ffc889",
                    ][index % 4],
                  } as React.CSSProperties
                }
                onClick={() => onSelect(network.id)}
                title={`${network.name} · ${network.member_count || 0} members`}
                aria-label={`Open ${network.name}, ${network.member_count || 0} members`}
              >
                <span>{network.name.slice(0, 1)}</span>
                <small>{network.name}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {depth && nodes.length > 0 && (
        <label className="cm-graph-rotate">
          Rotate
          <input
            aria-label="Rotate network graph"
            type="range"
            min="-60"
            max="60"
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
          />
        </label>
      )}
      <small className="cm-graph-caption">
        Connections show shared topics. Member counts come from saved
        memberships.
      </small>
    </div>
  );
}
