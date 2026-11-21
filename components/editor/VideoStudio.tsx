'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  applyAudioCleanupToGraph,
  type LiveAudioNodes,
} from '@/lib/audio/noiseSuppressor';
import { renderCompositionFrame, type MediaElementCache } from '@/lib/editor/canvasRenderer';
import { buildDemoProject, INITIAL_TRACKS } from '@/lib/editor/demoProject';
import {
  DEFAULT_AUDIO_CLEANUP,
  DEFAULT_COLOR_ADJUSTMENTS,
  DEFAULT_TRANSFORM,
  FILTER_PRESET_VALUES,
  getExportDimensions,
  getProjectDuration,
  splitClipAtTime,
} from '@/lib/editor/timelineMath';
import { getTransitionById } from '@/lib/editor/transitions';
import type {
  AspectRatio,
  FilterPreset,
  MediaAsset,
  MediaKind,
  ShapeKind,
  TextAnimationType,
  TimelineClip,
  TimelineTrack,
  TransitionType,
} from '@/lib/editor/types';
import AudioExtractModal from './AudioExtractModal';
import ExportModal from './ExportModal';
import LeftLibraryPanel, { type LibraryTab } from './LeftLibraryPanel';
import PreviewMonitor from './PreviewMonitor';
import RightInspectorPanel, { type InspectorTab } from './RightInspectorPanel';
import TimelinePanel from './TimelinePanel';
import TopToolbar from './TopToolbar';

function inferMediaKind(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'tiff', 'tif'].includes(ext)) {
    return 'image';
  }
  if (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'opus', 'aiff'].includes(ext)) {
    return 'audio';
  }
  return 'video';
}

export default function VideoStudio() {
  const [projectName, setProjectName] = useState('مشروع_سينا_4K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [tracks, setTracks] = useState<TimelineTrack[]>(INITIAL_TRACKS);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const [historyPast, setHistoryPast] = useState<TimelineClip[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<TimelineClip[][]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterMuted, setMasterMuted] = useState(false);
  const [bypassDenoise, setBypassDenoise] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const [libraryTab, setLibraryTab] = useState<LibraryTab>('transitions');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('general');
  const [zoomPxPerSec, setZoomPxPerSec] = useState(55);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isTranscoding, setIsTranscoding] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [audioExtractOpen, setAudioExtractOpen] = useState(false);
  const [audioExtractAssetId, setAudioExtractAssetId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaCacheRef = useRef<MediaElementCache>({
    videos: new Map(),
    images: new Map(),
  });
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGraphMapRef = useRef<Map<string, LiveAudioNodes>>(new Map());

  const clipsRef = useRef(clips);
  const tracksRef = useRef(tracks);
  const assetsMapRef = useRef<Map<string, MediaAsset>>(new Map());
  const currentTimeRef = useRef(currentTime);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const assetsMap = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  useEffect(() => {
    assetsMapRef.current = assetsMap;
  }, [assetsMap]);

  const projectDuration = useMemo(() => Math.max(4, getProjectDuration(clips)), [clips]);

  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) || null,
    [clips, selectedClipId]
  );

  const activeDenoiseCount = useMemo(
    () => clips.filter((c) => (c.kind === 'audio' || c.kind === 'video') && c.audio.denoiseEnabled).length,
    [clips]
  );

  const commitClipsChange = useCallback((updater: (prev: TimelineClip[]) => TimelineClip[]) => {
    setClips((prev) => {
      const next = updater(prev);
      setHistoryPast((h) => [...h.slice(-24), prev]);
      setHistoryFuture([]);
      return next;
    });
  }, []);

  // Load demo project on mount asynchronously after hydration
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const demo = buildDemoProject();
      setAssets(demo.assets);
      setClips(demo.clips);
      setSelectedClipId(demo.clips[0]?.id || null);
    });
    return () => {
      active = false;
    };
  }, []);

  // Preload HTMLImageElement / HTMLVideoElement / HTMLAudioElement for assets
  useEffect(() => {
    for (const asset of assets) {
      if (asset.kind === 'image' && !mediaCacheRef.current.images.has(asset.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = asset.src;
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (canvas && ctx) {
            renderCompositionFrame(
              ctx,
              canvas.width,
              canvas.height,
              clipsRef.current,
              tracksRef.current,
              assetsMapRef.current,
              mediaCacheRef.current,
              currentTimeRef.current
            );
          }
        };
        mediaCacheRef.current.images.set(asset.id, img);
      } else if (asset.kind === 'video' && !mediaCacheRef.current.videos.has(asset.id)) {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.src = asset.src;
        vid.preload = 'auto';
        vid.playsInline = true;
        mediaCacheRef.current.videos.set(asset.id, vid);
      } else if (asset.kind === 'audio' && !audioElementsRef.current.has(asset.id)) {
        const aud = new Audio(asset.src);
        aud.crossOrigin = 'anonymous';
        aud.preload = 'auto';
        audioElementsRef.current.set(asset.id, aud);
      }
    }
  }, [assets]);

  // Ensure Web Audio API noise-removal graph exists for a media element
  const ensureAudioGraph = useCallback((assetId: string, element: HTMLMediaElement) => {
    if (audioGraphMapRef.current.has(assetId)) return audioGraphMapRef.current.get(assetId)!;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    const source = ctx.createMediaElementSource(element);
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    const humNotch = ctx.createBiquadFilter();
    humNotch.type = 'peaking';
    const voicePresence = ctx.createBiquadFilter();
    voicePresence.type = 'peaking';
    const compressor = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(humNotch);
    humNotch.connect(voicePresence);
    voicePresence.connect(compressor);
    compressor.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);

    const nodes: LiveAudioNodes = {
      source,
      highpass,
      lowpass,
      humNotch,
      voicePresence,
      compressor,
      gain,
      analyser,
    };
    audioGraphMapRef.current.set(assetId, nodes);
    return nodes;
  }, []);

  // Resize canvas to crisp preview resolution ONLY when aspectRatio changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = getExportDimensions('720p', aspectRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderCompositionFrame(
        ctx,
        canvas.width,
        canvas.height,
        clipsRef.current,
        tracksRef.current,
        assetsMapRef.current,
        mediaCacheRef.current,
        currentTimeRef.current
      );
    }
  }, [aspectRatio]);

  // Sync audio & video elements and render canvas at currentTime
  const syncMediaAndRender = useCallback(
    (time: number, playing: boolean) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        renderCompositionFrame(
          ctx,
          canvas.width,
          canvas.height,
          clipsRef.current,
          tracksRef.current,
          assetsMapRef.current,
          mediaCacheRef.current,
          time
        );
      }

      const mutedTracks = new Set(tracksRef.current.filter((t) => t.muted).map((t) => t.id));
      const activeAudioOrVideoClips = clipsRef.current.filter(
        (c) =>
          (c.kind === 'audio' || c.kind === 'video') &&
          c.assetId &&
          time >= c.startTime &&
          time < c.startTime + c.duration
      );
      const activeAssetIds = new Set(activeAudioOrVideoClips.map((c) => c.assetId!));

      // Pause inactive elements
      for (const [id, vid] of mediaCacheRef.current.videos.entries()) {
        if (!activeAssetIds.has(id) && !vid.paused) vid.pause();
      }
      for (const [id, aud] of audioElementsRef.current.entries()) {
        if (!activeAssetIds.has(id) && !aud.paused) aud.pause();
      }

      let peakLevel = 0;

      for (const clip of activeAudioOrVideoClips) {
        const assetId = clip.assetId!;
        const el: HTMLMediaElement | undefined =
          clip.kind === 'video'
            ? mediaCacheRef.current.videos.get(assetId)
            : audioElementsRef.current.get(assetId);
        if (!el) continue;

        const targetTime = clip.trimStart + (time - clip.startTime) * clip.speed;
        const safeDur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 9999;
        const clampedTarget = Math.min(safeDur - 0.05, Math.max(0, targetTime));

        if (Math.abs(el.currentTime - clampedTarget) > (playing ? 0.25 : 0.04)) {
          el.currentTime = clampedTarget;
        }
        el.playbackRate = clip.speed || 1;

        if (playing) {
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
          }
          try {
            const nodes = ensureAudioGraph(assetId, el);
            const trackMuted = mutedTracks.has(clip.trackId) || masterMuted;
            applyAudioCleanupToGraph(nodes, clip.audio, trackMuted, bypassDenoise);

            const data = new Uint8Array(nodes.analyser.frequencyBinCount);
            nodes.analyser.getByteTimeDomainData(data);
            let maxDev = 0;
            for (let i = 0; i < data.length; i++) {
              const dev = Math.abs(data[i] - 128) / 128;
              if (dev > maxDev) maxDev = dev;
            }
            peakLevel = Math.max(peakLevel, maxDev * 140);
          } catch {
            el.muted = mutedTracks.has(clip.trackId) || masterMuted || clip.audio.muted;
            el.volume = Math.min(1, clip.audio.volume);
          }
          if (el.paused) {
            el.play().catch(() => {});
          }
        } else {
          if (!el.paused) el.pause();
        }
      }

      return Math.min(100, Math.round(peakLevel));
    },
    [bypassDenoise, ensureAudioGraph, masterMuted]
  );

  // Playback RAF Loop
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      const next = currentTimeRef.current + dt;
      if (next >= projectDuration) {
        setCurrentTime(0);
        setIsPlaying(false);
        setAudioLevel(0);
        syncMediaAndRender(0, false);
        return;
      }
      currentTimeRef.current = next;
      setCurrentTime(next);
      const peak = syncMediaAndRender(next, true);
      setAudioLevel(peak);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, projectDuration, syncMediaAndRender]);

  // Re-render when paused or when inspector properties change
  useEffect(() => {
    if (!isPlaying) {
      syncMediaAndRender(currentTime, false);
    }
  }, [clips, tracks, currentTime, isPlaying, syncMediaAndRender]);

  // Import ANY media format (browser-native fast path + FFmpeg transcode fallback)
  const handleImportFiles = useCallback(async (filesInput: FileList | File[]) => {
    const fileList = Array.from(filesInput);
    if (fileList.length === 0) return;

    for (const file of fileList) {
      const kind = inferMediaKind(file);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const nativeUrl = URL.createObjectURL(file);

      const tryNativeProbe = (): Promise<{
        ok: boolean;
        duration: number;
        width: number;
        height: number;
        thumbnail?: string;
      }> =>
        new Promise((resolve) => {
          if (kind === 'image') {
            const img = new Image();
            img.onload = () =>
              resolve({
                ok: true,
                duration: 5,
                width: img.naturalWidth || 1920,
                height: img.naturalHeight || 1080,
                thumbnail: nativeUrl,
              });
            img.onerror = () => resolve({ ok: false, duration: 5, width: 1920, height: 1080 });
            img.src = nativeUrl;
          } else if (kind === 'audio') {
            const aud = new Audio();
            aud.onloadedmetadata = () =>
              resolve({
                ok: true,
                duration: Number.isFinite(aud.duration) ? aud.duration : 10,
                width: 0,
                height: 0,
              });
            aud.onerror = () => resolve({ ok: false, duration: 10, width: 0, height: 0 });
            aud.src = nativeUrl;
          } else {
            const vid = document.createElement('video');
            vid.preload = 'metadata';
            vid.onloadedmetadata = () => {
              resolve({
                ok: true,
                duration: Number.isFinite(vid.duration) ? vid.duration : 6,
                width: vid.videoWidth || 1920,
                height: vid.videoHeight || 1080,
              });
            };
            vid.onerror = () => resolve({ ok: false, duration: 6, width: 1920, height: 1080 });
            vid.src = nativeUrl;
          }
        });

      const probed = await tryNativeProbe();
      let finalSrc = nativeUrl;
      let finalDuration = probed.duration;
      let finalW = probed.width;
      let finalH = probed.height;
      let transcodedFrom: string | undefined;

      if (!probed.ok) {
        // Use FFmpeg backend transcode so ANY format (MKV, AVI, FLV, HEIC, WMA, etc.) works seamlessly
        setIsTranscoding(true);
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('kind', kind);
          const resp = await fetch('/api/media/transcode', { method: 'POST', body: fd });
          if (resp.ok) {
            const blob = await resp.blob();
            URL.revokeObjectURL(nativeUrl);
            finalSrc = URL.createObjectURL(blob);
            finalDuration = Number(resp.headers.get('X-Media-Duration')) || 6;
            finalW = Number(resp.headers.get('X-Media-Width')) || 1920;
            finalH = Number(resp.headers.get('X-Media-Height')) || 1080;
            transcodedFrom = ext.toUpperCase();
          }
        } finally {
          setIsTranscoding(false);
        }
      }

      const newAsset: MediaAsset = {
        id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        kind,
        src: finalSrc,
        originalExt: ext,
        mimeType: file.type || `${kind}/${ext}`,
        duration: Math.max(1, Number(finalDuration.toFixed(2))),
        width: finalW,
        height: finalH,
        thumbnail: kind === 'image' ? finalSrc : undefined,
        waveform:
          kind === 'audio'
            ? Array.from({ length: 48 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.65)) * 0.7)
            : undefined,
        transcodedFrom,
        rawFile: file,
      };

      setAssets((prev) => [newAsset, ...prev]);
    }
  }, []);

  const handleAddAssetToTimeline = useCallback(
    (asset: MediaAsset) => {
      const targetTrackId =
        asset.kind === 'audio'
          ? 'track-a1'
          : asset.kind === 'image'
          ? 'track-v1'
          : 'track-v1';

      const trackClips = clips.filter((c) => c.trackId === targetTrackId);
      const endOfTrack = trackClips.reduce(
        (max, c) => Math.max(max, c.startTime + c.duration),
        0
      );

      const newClip: TimelineClip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        trackId: targetTrackId,
        kind: asset.kind,
        name: asset.name.replace(/\.[^.]+$/, ''),
        assetId: asset.id,
        startTime: Number(endOfTrack.toFixed(2)),
        duration: Math.min(12, Math.max(2, asset.duration)),
        trimStart: 0,
        speed: 1,
        inTransition: { type: 'crossfade', duration: 0.7, easing: 'easeInOut' },
        outTransition: { type: 'none', duration: 0.7, easing: 'easeInOut' },
        color: { ...DEFAULT_COLOR_ADJUSTMENTS },
        transform: { ...DEFAULT_TRANSFORM },
        audio: { ...DEFAULT_AUDIO_CLEANUP },
        accentColor:
          asset.kind === 'audio' ? '#06B6D4' : asset.kind === 'image' ? '#10B981' : '#F59E0B',
      };

      commitClipsChange((prev) => [...prev, newClip]);
      setSelectedClipId(newClip.id);
      setCurrentTime(newClip.startTime);
    },
    [clips, commitClipsChange]
  );

  const handleApplyTransition = useCallback(
    (type: TransitionType, target: 'in' | 'out') => {
      const def = getTransitionById(type);
      const dur = def?.defaultDuration ?? 0.8;
      const targetClip =
        clips.find((c) => c.id === selectedClipId) ||
        clips.find((c) => c.kind === 'video' || c.kind === 'image');
      if (!targetClip) return;

      commitClipsChange((prev) =>
        prev.map((c) => {
          if (c.id !== targetClip.id) return c;
          if (target === 'in') {
            return { ...c, inTransition: { ...c.inTransition, type, duration: dur } };
          }
          return { ...c, outTransition: { ...c.outTransition, type, duration: dur } };
        })
      );
      setSelectedClipId(targetClip.id);

      // Jump playhead right into the transition midpoint so the user sees it instantaneously!
      if (target === 'in') {
        setCurrentTime(targetClip.startTime + dur * 0.48);
      } else {
        setCurrentTime(Math.max(0, targetClip.startTime + targetClip.duration - dur * 0.48));
      }
    },
    [clips, selectedClipId, commitClipsChange]
  );

  const handleAddTextClip = useCallback(
    (preset: {
      name: string;
      content: string;
      animation: TextAnimationType;
      fontSize: number;
      color: string;
      bgOpacity: number;
    }) => {
      const newClip: TimelineClip = {
        id: `clip_txt_${Date.now()}`,
        trackId: 'track-t1',
        kind: 'text',
        name: preset.name,
        startTime: Number(currentTime.toFixed(2)),
        duration: 4.0,
        trimStart: 0,
        speed: 1,
        inTransition: { type: 'none', duration: 0.5, easing: 'easeInOut' },
        outTransition: { type: 'none', duration: 0.5, easing: 'easeInOut' },
        color: { ...DEFAULT_COLOR_ADJUSTMENTS },
        transform: { ...DEFAULT_TRANSFORM },
        audio: { ...DEFAULT_AUDIO_CLEANUP },
        text: {
          content: preset.content,
          fontFamily: 'Cairo',
          fontSize: preset.fontSize,
          color: preset.color,
          strokeColor: '#000000',
          strokeWidth: 0,
          bgColor: '#0F172A',
          bgOpacity: preset.bgOpacity,
          align: 'center',
          bold: true,
          shadow: true,
          animation: preset.animation,
          letterSpacing: 0,
        },
        accentColor: '#EC4899',
      };
      commitClipsChange((prev) => [...prev, newClip]);
      setSelectedClipId(newClip.id);
      setInspectorTab('general');
    },
    [currentTime, commitClipsChange]
  );

  const handleAddShapeClip = useCallback(
    (preset: {
      name: string;
      shapeType: ShapeKind;
      fillColor: string;
      fillSecondary: string;
      strokeColor: string;
      width: number;
      height: number;
      labelText?: string;
    }) => {
      const newClip: TimelineClip = {
        id: `clip_shp_${Date.now()}`,
        trackId: 'track-s1',
        kind: 'shape',
        name: preset.name,
        startTime: Number(currentTime.toFixed(2)),
        duration: 4.0,
        trimStart: 0,
        speed: 1,
        inTransition: { type: 'none', duration: 0.5, easing: 'easeInOut' },
        outTransition: { type: 'none', duration: 0.5, easing: 'easeInOut' },
        color: { ...DEFAULT_COLOR_ADJUSTMENTS },
        transform: { ...DEFAULT_TRANSFORM },
        audio: { ...DEFAULT_AUDIO_CLEANUP },
        shape: {
          shapeType: preset.shapeType,
          fillColor: preset.fillColor,
          fillSecondary: preset.fillSecondary,
          useGradient: true,
          strokeColor: preset.strokeColor,
          strokeWidth: 3,
          cornerRadius: 14,
          width: preset.width,
          height: preset.height,
          animation: 'scale_pop',
          shadow: true,
          labelText: preset.labelText,
        },
        accentColor: '#8B5CF6',
      };
      commitClipsChange((prev) => [...prev, newClip]);
      setSelectedClipId(newClip.id);
      setInspectorTab('general');
    },
    [currentTime, commitClipsChange]
  );

  const handleApplyFilterPreset = useCallback(
    (preset: FilterPreset) => {
      const targetClip =
        clips.find((c) => c.id === selectedClipId && c.kind !== 'audio') ||
        clips.find((c) => c.kind === 'video' || c.kind === 'image');
      if (!targetClip) return;
      const presetVals = FILTER_PRESET_VALUES[preset];
      commitClipsChange((prev) =>
        prev.map((c) =>
          c.id === targetClip.id
            ? { ...c, color: { ...c.color, ...presetVals, preset } }
            : c
        )
      );
      setSelectedClipId(targetClip.id);
    },
    [clips, selectedClipId, commitClipsChange]
  );

  const handleSplitAtPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    commitClipsChange((prev) => splitClipAtTime(prev, selectedClipId, currentTime));
  }, [selectedClipId, currentTime, commitClipsChange]);

  const handleDuplicateSelected = useCallback(() => {
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const copy: TimelineClip = {
      ...clip,
      id: `${clip.id}_copy_${Date.now().toString().slice(-4)}`,
      name: `${clip.name} (نسخة)`,
      startTime: Number((clip.startTime + clip.duration).toFixed(2)),
    };
    commitClipsChange((prev) => [...prev, copy]);
    setSelectedClipId(copy.id);
  }, [clips, selectedClipId, commitClipsChange]);

  const handleDeleteClip = useCallback(
    (clipId: string) => {
      commitClipsChange((prev) => prev.filter((c) => c.id !== clipId));
      if (selectedClipId === clipId) setSelectedClipId(null);
    },
    [selectedClipId, commitClipsChange]
  );

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setHistoryFuture((f) => [clipsRef.current, ...f]);
      setClips(previous);
      return past.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryFuture((future) => {
      if (future.length === 0) return future;
      const next = future[0];
      setHistoryPast((p) => [...p, clipsRef.current]);
      setClips(next);
      return future.slice(1);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setCurrentTime((t) => Math.max(0, t - 1 / 30));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTime((t) => Math.min(projectDuration, t + 1 / 30));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [projectDuration, handleUndo, handleRedo]);

  const canSplit = Boolean(
    selectedClip &&
      currentTime > selectedClip.startTime + 0.25 &&
      currentTime < selectedClip.startTime + selectedClip.duration - 0.25
  );

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      data-testid="video-studio-root"
      data-playing={String(isPlaying)}
      data-clip-count={clips.length}
      className="h-screen w-screen overflow-hidden bg-[#0A0D12] text-slate-100 flex flex-col"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      <TopToolbar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        aspectRatio={aspectRatio}
        onImportClick={() => fileInputRef.current?.click()}
        onSplitClick={handleSplitAtPlayhead}
        canSplit={canSplit}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onOpenAudioExtract={() => {
          setAudioExtractAssetId(null);
          setAudioExtractOpen(true);
        }}
        onOpenExport={() => setExportOpen(true)}
        isTranscoding={isTranscoding}
      />

      {/* Middle Workspace: Left Library + Center Monitor + Right Inspector */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <LeftLibraryPanel
          activeTab={libraryTab}
          onTabChange={setLibraryTab}
          assets={assets}
          onImportFiles={handleImportFiles}
          onAddAssetToTimeline={handleAddAssetToTimeline}
          onExtractAudioFromAsset={(asset) => {
            setAudioExtractAssetId(asset.id);
            setAudioExtractOpen(true);
          }}
          onApplyTransition={handleApplyTransition}
          selectedTransitionIn={selectedClip?.inTransition.type ?? 'none'}
          selectedTransitionOut={selectedClip?.outTransition.type ?? 'none'}
          onAddTextClip={handleAddTextClip}
          onAddShapeClip={handleAddShapeClip}
          onApplyFilterPreset={handleApplyFilterPreset}
          activeFilterPreset={selectedClip?.color.preset ?? 'none'}
          isTranscoding={isTranscoding}
        />

        <PreviewMonitor
          canvasRef={canvasRef}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onSeekStart={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onStepFrame={(dir) => {
            setIsPlaying(false);
            setCurrentTime((t) => Math.max(0, Math.min(projectDuration, t + dir * (1 / 30))));
          }}
          currentTime={currentTime}
          duration={projectDuration}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          masterMuted={masterMuted}
          onToggleMasterMute={() => setMasterMuted((m) => !m)}
          audioLevel={isPlaying ? audioLevel : 0}
          activeDenoiseCount={activeDenoiseCount}
        />

        <RightInspectorPanel
          clip={selectedClip}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          onUpdateClip={(clipId, updater) =>
            setClips((prev) => prev.map((c) => (c.id === clipId ? updater(c) : c)))
          }
          onDeleteClip={handleDeleteClip}
          bypassDenoise={bypassDenoise}
          onToggleBypassDenoise={() => setBypassDenoise((b) => !b)}
        />
      </div>

      <TimelinePanel
        tracks={tracks}
        clips={clips}
        assets={assetsMap}
        selectedClipId={selectedClipId}
        currentTime={currentTime}
        projectDuration={projectDuration}
        zoomPxPerSec={zoomPxPerSec}
        snapEnabled={snapEnabled}
        onSelectClip={setSelectedClipId}
        onSeek={(t) => {
          setIsPlaying(false);
          setCurrentTime(t);
        }}
        onMoveClip={(clipId, newStart) =>
          setClips((prev) =>
            prev.map((c) => (c.id === clipId ? { ...c, startTime: newStart } : c))
          )
        }
        onTrimClip={(clipId, newStart, newDuration, newTrim) =>
          setClips((prev) =>
            prev.map((c) =>
              c.id === clipId
                ? { ...c, startTime: newStart, duration: newDuration, trimStart: newTrim }
                : c
            )
          )
        }
        onSplitAtPlayhead={handleSplitAtPlayhead}
        onDuplicateSelected={handleDuplicateSelected}
        onDeleteSelected={() => {
          if (selectedClipId) handleDeleteClip(selectedClipId);
        }}
        onToggleTrackMute={(trackId) =>
          setTracks((prev) =>
            prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t))
          )
        }
        onToggleTrackHidden={(trackId) =>
          setTracks((prev) =>
            prev.map((t) => (t.id === trackId ? { ...t, hidden: !t.hidden } : t))
          )
        }
        onToggleTrackLock={(trackId) =>
          setTracks((prev) =>
            prev.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t))
          )
        }
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        onZoomChange={setZoomPxPerSec}
      />

      {exportOpen && (
        <ExportModal
          isOpen={exportOpen}
          onClose={() => setExportOpen(false)}
          projectName={projectName}
          aspectRatio={aspectRatio}
          clips={clips}
          tracks={tracks}
          assets={assetsMap}
          getMediaCache={() => mediaCacheRef.current}
          projectDuration={projectDuration}
        />
      )}

      {audioExtractOpen && (
        <AudioExtractModal
          isOpen={audioExtractOpen}
          onClose={() => setAudioExtractOpen(false)}
          assets={assets}
          initialAssetId={audioExtractAssetId}
          clips={clips}
          tracks={tracks}
          assetsMap={assetsMap}
          projectDuration={projectDuration}
        />
      )}
    </motion.main>
  );
}
