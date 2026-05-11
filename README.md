# Synth Riders Web Map Editor

Cross-platform, browser-based beatmap editor for Synth Riders. Load, edit, and export `.synth` files — no Windows required.

## Status

MVP 0 — skeleton compiling, file picker working, editor layout in place. Active development.

## Quick Start

```bash
npm install
npm run dev      # → http://localhost:3000
```

Drop a `.synth` file on the welcome screen or click Browse.

## Stack

- React 19 + TypeScript + Vite
- Three.js (@react-three/fiber) for 3D viewport
- Zustand for state management
- wavesurfer.js for audio waveform
- JSZip for .synth file parsing
- cmdk for command palette

## What This Is

A **human mapper tool** — not an automapper. Load real .synth files, edit them in a timeline with beat grid and 3D preview, export back to game-compatible format. AI-assisted features may come later as opt-in tools.

## What This Is NOT

- A copy of official Synth Riders Beatmap Editor code or assets
- A one-click map generator
- A tool to flood the community

## Project Structure

```
src/
  main.tsx              # Entry point, React Router
  screens/
    WelcomeScreen.tsx   # File drop zone, .synth loader
    EditorScreen.tsx    # Main editor layout
  components/
    timeline/           # Timeline, Playhead
    preview/            # Preview3D (Three.js viewport)
    inspector/          # InspectorPanel (properties)
    command/            # CommandPalette (cmdk)
    ai/                 # AIPalette (stub)
  stores/
    editor.ts           # Editor UI state (Zustand)
    project.ts          # Project/notes state (Zustand)
  types/
    synth.ts            # .synth format types + converters
```

## .synth Format

`.synth` files are ZIP archives containing `beatmap.meta.bin` (JSON, may be AES-encrypted on Quest) and audio/artwork assets. Full format spec in the project wiki.

## License

GPL-3.0 — free and open source.

## Links

- Repo: https://github.com/marc0ne-s/synthriders-web-editor
- Project wiki: Obsidian vault `Projects/SynthRiders-Web-Map-Editor/`
