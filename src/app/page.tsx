"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { Sparkles, RefreshCcw, ChevronRight, LayoutGrid, X, Trash2 } from "lucide-react";
import confetti from "canvas-confetti";

type PackState = "sealed" | "tearing" | "opened" | "revealing" | "done";
type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
type SortOption = "name_asc" | "name_desc" | "rarity_high" | "rarity_low" | "views_high" | "views_low" | "favorites_high" | "favorites_low";

import { CardData, fetchRandomImages } from "../lib/motherless";

const ScrollableTitle = ({ title, baseClass }: { title: string; baseClass: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setShouldScroll(textRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [title]);

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden mb-3 relative ${shouldScroll ? "mask-image-edges" : "flex justify-center"}`}
      style={shouldScroll ? { WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" } : {}}
    >
      <div className={shouldScroll ? "w-max animate-marquee whitespace-nowrap flex" : "w-full text-center flex flex-col items-center"}>
        <h2 ref={textRef} className={`${baseClass} ${shouldScroll ? "pr-8" : "line-clamp-2"}`}>
          {title}
        </h2>
        {shouldScroll && (
          <h2 className={`${baseClass} pr-8`}>
            {title}
          </h2>
        )}
      </div>
    </div>
  );
};

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export default function Home() {
  const [packState, setPackState] = useState<PackState>("sealed");
  const [tearProgress, setTearProgress] = useState(0);
  const [isTearing, setIsTearing] = useState(false);
  const [cards, setCards] = useState<CardData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
  const [isGridView, setIsGridView] = useState(false);
  const [collection, setCollection] = useState<CardData[]>([]);
  const [isCollectionView, setIsCollectionView] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("rarity_high");
  const [gridSize, setGridSize] = useState<"sm" | "md" | "lg">("md");
  const [isMuted, setIsMuted] = useState(false);
  const [newCardIds, setNewCardIds] = useState<Set<string>>(new Set());
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [packSize, setPackSize] = useState(5);
  const [confirmClear, setConfirmClear] = useState(false);

  const clearCollection = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    } else {
      setCollection([]);
      localStorage.removeItem("photo_collection");
      setConfirmClear(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auto") === "true") setIsAutoMode(true);
      const countParam = params.get("count");
      if (countParam) {
        const parsedCount = parseInt(countParam, 10);
        if (!isNaN(parsedCount)) {
          setPackSize(Math.max(1, Math.min(100, parsedCount)));
        }
      }
    }
  }, []);

  const playSound = useCallback((type: "tear" | "flip" | "sparkle" | "swoosh" | Rarity) => {
    if (isMuted) return;
    const urls = {
      tear: "https://assets.mixkit.co/active_storage/sfx/147/147-preview.mp3",
      flip: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3",
      swoosh: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3",
      sparkle: "https://assets.mixkit.co/active_storage/sfx/1998/1998-preview.mp3",
      Common: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3",
      Uncommon: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3",
      Rare: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3",
      Epic: "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3",
      Legendary: "https://assets.mixkit.co/active_storage/sfx/1998/1998-preview.mp3",
    };
    const audio = new Audio(urls[type as keyof typeof urls] || urls.flip);
    let baseVolume = 0.08;
    if (type === "Legendary" || type === "sparkle") baseVolume = 0.4;
    if (type === "Epic") baseVolume = 0.15;
    if (type === "Rare") baseVolume = 0.12;
    audio.volume = baseVolume;
    audio.play().catch((e) => console.log("Audio play blocked", e));
    const duration = type === "Legendary" || type === "sparkle" ? 3000 : 500;
    setTimeout(() => {
      const fadeOut = setInterval(() => {
        if (audio.volume > 0.01) audio.volume -= 0.01;
        else { audio.pause(); clearInterval(fadeOut); }
      }, 20);
    }, duration);
  }, [isMuted]);

  const playedRevealSounds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (packState !== "revealing") return;
    if (flippedCards[activeCardIndex] && !playedRevealSounds.current.has(activeCardIndex)) {
      const card = cards[activeCardIndex];
      if (card) {
        playedRevealSounds.current.add(activeCardIndex);
        playSound(card.rarity);
        if (card.rarity === "Legendary") {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ["#FBBF24", "#F59E0B", "#D97706", "#FFFBEB"] });
        }
      }
    }
  }, [flippedCards, activeCardIndex, packState, cards, playSound]);

  useEffect(() => {
    const saved = localStorage.getItem("photo_collection");
    if (saved) {
      try { setCollection(JSON.parse(saved)); } catch (e) { console.error("Failed to parse local collection", e); }
    }
  }, []);

  const topPartRef = useRef<HTMLDivElement>(null);
  const isOpenedRef = useRef(false);
  const controls = useAnimation();

  const handleOpen = useCallback(async () => {
    if (isOpenedRef.current) return;
    isOpenedRef.current = true;
    setIsLoading(true);
    const fetchedCards = await fetchRandomImages(packSize);

    if (fetchedCards.length === 0) {
      setIsLoading(false);
      isOpenedRef.current = false;
      setPackState("sealed");
      setTearProgress(0);
      alert("Failed to load cards. Please check your connection and try again.");
      return;
    }

    const existingIds = new Set(collection.map((c) => c.id));
    const newlyFoundIds = new Set<string>();
    fetchedCards.forEach((c) => { if (!existingIds.has(c.id)) newlyFoundIds.add(c.id); });
    setNewCardIds(newlyFoundIds);

    setCards(fetchedCards);
    setIsLoading(false);

    setCollection((prev) => {
      const newCollection = [...prev, ...fetchedCards];
      localStorage.setItem("photo_collection", JSON.stringify(newCollection));
      return newCollection;
    });

    setPackState("opened");
    setTearProgress(100);
    controls.start({ y: -150, x: 100, opacity: 0, rotate: 25, transition: { duration: 0.6, ease: "easeOut" } });
    setTimeout(() => setPackState("revealing"), 800);
  }, [controls, collection, packSize]);

  const updateTear = (clientX: number) => {
    if (topPartRef.current && !isOpenedRef.current) {
      const rect = topPartRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      let progress = (x / rect.width) * 100;
      progress = Math.max(0, Math.min(100, progress));
      setTearProgress((prev) => {
        const newProgress = Math.max(prev, progress);
        if (newProgress >= 85) { setTimeout(handleOpen, 0); return 100; }
        return newProgress;
      });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (packState !== "sealed" && packState !== "tearing") return;
    setIsTearing(true);
    setPackState("tearing");
    playSound("tear");
    updateTear(e.clientX);
    if (topPartRef.current) topPartRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isTearing) return;
    updateTear(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isTearing) return;
    setIsTearing(false);
    if (topPartRef.current) topPartRef.current.releasePointerCapture(e.pointerId);
    if (tearProgress > 85) handleOpen();
    else { setTearProgress(0); setPackState("sealed"); }
  };

  const handleFlip = (idx: number) => setFlippedCards((prev) => ({ ...prev, [idx]: true }));

  const handleNextCard = useCallback(() => {
    if (activeCardIndex < cards.length - 1) setActiveCardIndex((prev) => prev + 1);
    else setPackState("done");
  }, [activeCardIndex, cards.length]);

  const handleSkipAll = () => {
    const allFlipped: Record<number, boolean> = {};
    cards.forEach((_, idx) => { allFlipped[idx] = true; });
    setFlippedCards(allFlipped);
    setPackState("done");
    setActiveCardIndex(cards.length - 1);
  };

  useEffect(() => {
    if (!isAutoMode) return;
    if (packState === "sealed") {
      const timer = setTimeout(() => handleOpen(), 2500);
      return () => clearTimeout(timer);
    }
    if (packState === "revealing") {
      const isFlipped = flippedCards[activeCardIndex];
      if (!isFlipped) {
        const timer = setTimeout(() => handleFlip(activeCardIndex), 1000);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => handleNextCard(), 6000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAutoMode, packState, activeCardIndex, flippedCards, handleOpen, handleNextCard]);

  const resetPack = () => {
    isOpenedRef.current = false;
    setPackState("sealed");
    setTearProgress(0);
    setCards([]);
    setActiveCardIndex(0);
    setFlippedCards({});
    setIsGridView(false);
    setNewCardIds(new Set());
    playedRevealSounds.current.clear();
    controls.set({ x: 0, y: 0, opacity: 1, rotate: 0 });
  };

  const topFoilContent = (
    <div className="w-full h-full flex flex-col pointer-events-none">
      <div className="w-full h-4 bg-gradient-to-b from-slate-500 to-slate-600 rounded-t-lg overflow-hidden flex shrink-0">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={`crimp-${i}`} className="flex-1 border-r border-slate-700/30" />
        ))}
      </div>
      <div className="w-full flex-1 bg-gradient-to-b from-slate-800 to-slate-900 relative overflow-hidden border-b border-slate-700/50 shadow-inner">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay" />
        <div className="absolute top-1/2 left-0 right-0 transform -translate-y-1/2 flex items-center justify-center px-4">
          {isLoading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center rounded-xl">
              <div className="flex flex-col items-center">
                <RefreshCcw className="w-8 h-8 text-white animate-spin mb-2" />
                <span className="text-white font-medium text-sm animate-pulse">Loading Images...</span>
              </div>
            </div>
          )}
          {(packState === "sealed" || packState === "tearing") && tearProgress < 10 && !isLoading && (
            <div className="bg-black/40 backdrop-blur text-white/90 text-xs py-1 px-3 rounded-full font-semibold animate-pulse shadow-lg border border-white/10">
              Swipe to Tear ✨
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px] border-b-2 border-dashed border-white/20 truncate" />
      </div>
    </div>
  );

  const getRarityColors = (rarity: Rarity) => {
    const colors: Record<Rarity, { bg: string; text: string; icon: string; border: string }> = {
      Common: { bg: "from-slate-300 via-gray-200 to-slate-400", text: "text-slate-800", icon: "text-slate-100", border: "border-slate-100/50" },
      Uncommon: { bg: "from-green-300 via-emerald-200 to-green-400", text: "text-green-900", icon: "text-green-100", border: "border-green-100/50" },
      Rare: { bg: "from-blue-300 via-cyan-200 to-blue-400", text: "text-blue-900", icon: "text-blue-100", border: "border-blue-100/50" },
      Epic: { bg: "from-purple-300 via-fuchsia-200 to-purple-400", text: "text-purple-900", icon: "text-purple-100", border: "border-purple-100/50" },
      Legendary: { bg: "from-yellow-300 via-amber-200 to-orange-400", text: "text-amber-900", icon: "text-yellow-100", border: "border-yellow-100/50" },
    };
    return colors[rarity] || colors.Common;
  };

  const rarityOrder: Record<Rarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

  const getGroupedCollection = (cardList: CardData[]) => {
    const groups: Map<string, { card: CardData; count: number }> = new Map();
    cardList.forEach((card) => {
      if (groups.has(card.id)) groups.get(card.id)!.count++;
      else groups.set(card.id, { card, count: 1 });
    });
    return Array.from(groups.values());
  };

  const getSortedCards = (cardList: CardData[]) => {
    return [...cardList].sort((a, b) => {
      switch (sortBy) {
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "rarity_high": return rarityOrder[b.rarity] - rarityOrder[a.rarity] || a.name.localeCompare(b.name);
        case "rarity_low": return rarityOrder[a.rarity] - rarityOrder[b.rarity] || a.name.localeCompare(b.name);
        case "views_high": return b.views - a.views;
        case "views_low": return a.views - b.views;
        case "favorites_high": return b.favorites - a.favorites;
        case "favorites_low": return a.favorites - b.favorites;
        default: return 0;
      }
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center overflow-hidden font-sans text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(120,0,255,0.1),_rgba(0,0,0,1))] pointer-events-none" />

      <main className="relative z-10 w-full max-w-md mx-auto p-6 h-[100dvh] flex flex-col items-center justify-center">
        {/* HEADER */}
        <div className="absolute top-6 w-full px-6 flex justify-between items-center z-50 pointer-events-none left-0 right-0 max-w-md">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 pointer-events-auto">
            Pack Opener
          </h1>
          <div className="flex items-center gap-2 pointer-events-auto">
            {isAutoMode && (
              <div className="bg-red-600/20 border border-red-500/50 px-2 py-1 rounded text-[10px] font-black text-red-400 tracking-tighter animate-pulse uppercase">
                Auto Mode
              </div>
            )}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white p-2 rounded-full shadow-lg transition-all"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
              ) : (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              )}
            </button>
            <button
              onClick={() => setIsCollectionView(true)}
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold py-2 px-3 sm:px-4 rounded-full shadow-lg transition-all text-xs sm:text-sm flex items-center gap-1 sm:gap-2"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Collection</span>
              <span className="bg-pink-600/80 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold">{collection.length}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 w-full relative flex items-center justify-center select-none pt-16">

          {/* CARDS DISPLAY */}
          <AnimatePresence>
            {(packState === "revealing" || packState === "done") && cards.map((card, idx) => {
              if (packState === "revealing" && idx !== activeCardIndex) return null;
              const isFlipped = flippedCards[idx] || packState === "done";
              const zIndex = packState === "done" ? cards.length - idx : 20;
              const col = getRarityColors(card.rarity);

              return (
                <motion.div
                  key={`${card.id}-${idx}`}
                  initial={{ y: 50, scale: 0.8, opacity: 0 }}
                  animate={{
                    y: packState === "done" ? idx * 10 - 20 : 0,
                    x: packState === "done" ? (idx - 2) * 20 : 0,
                    scale: packState === "done" ? 0.9 : 1,
                    opacity: 1,
                    rotate: packState === "done" ? (idx - 2) * 5 : 0,
                  }}
                  exit={{ y: -50, opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
                  onClick={() => {
                    if (isAutoMode) return;
                    if (packState === "revealing") {
                      if (!isFlipped) handleFlip(idx);
                      else if (idx === activeCardIndex) handleNextCard();
                    }
                  }}
                  className={`absolute ${isAutoMode ? "pointer-events-none" : "cursor-pointer"} w-[90vw] max-w-[368px] aspect-[368/461]`}
                  style={{ zIndex, perspective: "1000px" }}
                >
                  <motion.div
                    className="w-full h-full relative"
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: isFlipped ? 0 : 180 }}
                    transition={{ duration: 0.6, type: "spring" }}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {/* Card Back */}
                    <div
                      className="absolute inset-0 w-full h-full bg-slate-900 rounded-xl border-4 border-slate-500 shadow-xl flex flex-col items-center justify-center overflow-hidden"
                      style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                    >
                      {/* Decorative dots */}
                      <div className="absolute left-1 top-0 bottom-0 w-3 flex flex-col py-1 space-y-1.5 opacity-30">
                        {Array.from({ length: 24 }).map((_, i) => <div key={`l-${i}`} className="w-full h-2 bg-black rounded-sm" />)}
                      </div>
                      <div className="absolute right-1 top-0 bottom-0 w-3 flex flex-col py-1 space-y-1.5 opacity-30">
                        {Array.from({ length: 24 }).map((_, i) => <div key={`r-${i}`} className="w-full h-2 bg-black rounded-sm" />)}
                      </div>
                      <div className="w-24 h-24 rounded-full border-2 border-slate-500/30 flex items-center justify-center p-2 mb-4 relative">
                        <div className="absolute inset-2 rounded-full border border-dashed border-slate-400/60 animate-[spin_20s_linear_infinite]" />
                        <div className="text-4xl filter grayscale brightness-150">📷</div>
                      </div>
                      <div className="text-slate-300 font-black text-xl tracking-[0.2em] font-serif text-center drop-shadow-lg">
                        PHOTO<br />COLLECTION
                      </div>
                      {packState === "revealing" && !isFlipped && (
                        <div className="absolute bottom-6 left-0 right-0 text-center text-[10px] font-black tracking-[0.2em] text-slate-400/80 animate-pulse uppercase">
                          {isAutoMode ? "Auto-Revealing..." : "Tap to Flip"}
                        </div>
                      )}
                    </div>

                    {/* Card Front */}
                    <div
                      className={`absolute inset-0 w-full h-full bg-gradient-to-br ${col.bg} rounded-xl p-1 shadow-2xl`}
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <div className={`w-full h-full border-2 ${col.border} rounded-lg flex flex-col bg-slate-900/40 relative overflow-hidden`}>

                        {/* Full-bleed image */}
                        {card.imageUrl && (
                          <div
                            className="absolute inset-0 z-0 bg-cover bg-center"
                            style={{ backgroundImage: `url(${card.imageUrl})` }}
                          />
                        )}

                        {/* Gradient overlays - opaque enough to be seen even without image */}
                        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent z-10 pointer-events-none" />

                        {/* Top: Rarity badge */}
                        <div className="relative z-20 flex justify-between items-start w-full p-3">
                          <div className="flex flex-col gap-1">
                            <div className="bg-black/60 rounded px-2 py-1 flex items-center gap-1 shadow-md">
                              <Sparkles className={`w-4 h-4 ${col.icon}`} />
                              <span className={`text-xs font-bold uppercase tracking-wider ${col.text}`}>{card.rarity}</span>
                            </div>
                            {newCardIds.has(card.id) && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-tighter w-fit"
                              >
                                New!
                              </motion.div>
                            )}
                          </div>
                          {/* Views badge */}
                          <div className="bg-black/60 rounded px-2 py-1 shadow-md">
                            <span className="text-white font-bold text-sm">👁 {formatCount(card.views)}</span>
                          </div>
                        </div>

                        {/* Bottom: Title + Favorites */}
                        <div className="relative z-20 mt-auto p-4 w-full flex flex-col items-center">
                          <ScrollableTitle title={card.name} baseClass="text-lg font-black text-white uppercase tracking-tight drop-shadow-md leading-tight text-center" />
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-pink-400 font-bold text-sm drop-shadow-md">❤️ {formatCount(card.favorites)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-30 mix-blend-overlay rounded-xl pointer-events-none" />
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* THE PACK */}
          {packState !== "done" && packState !== "revealing" && (
            <motion.div
              className="absolute w-[90vw] max-w-[368px] aspect-[368/461] z-30 flex flex-col items-center"
              animate={{ y: [0, -5, 0], transition: { repeat: Infinity, duration: 4, ease: "easeInOut" } }}
            >
              <div className="relative w-full h-full flex flex-col group drop-shadow-2xl">
                {/* TOP TEARABLE PART */}
                <motion.div
                  ref={topPartRef}
                  onPointerDown={(e) => !isAutoMode && handlePointerDown(e)}
                  onPointerMove={(e) => !isAutoMode && handlePointerMove(e)}
                  onPointerUp={(e) => !isAutoMode && handlePointerUp(e)}
                  onPointerCancel={(e) => !isAutoMode && handlePointerUp(e)}
                  animate={controls}
                  className={`relative h-1/4 w-full ${isAutoMode ? "pointer-events-none" : "cursor-pointer"} z-40 touch-none`}
                  style={{
                    transformOrigin: "100% 100%",
                    transform: tearProgress > 0 ? `rotate(${tearProgress * 0.05}deg) translateY(${-tearProgress * 0.05}px)` : "none",
                  }}
                >
                  <div className="absolute inset-0 w-full h-full drop-shadow-2xl">
                    {topFoilContent}
                    {tearProgress > 0 && tearProgress < 100 && (
                      <div className="absolute bottom-[-1px] left-0 h-[3px] bg-white/60 blur-[2px]" style={{ width: `${tearProgress}%` }} />
                    )}
                  </div>
                </motion.div>

                {/* BOTTOM MAIN BODY */}
                <div className="h-3/4 w-full bg-gradient-to-b from-slate-800 to-black relative rounded-b-lg overflow-hidden shadow-2xl border-t border-slate-700">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay" />

                  {/* Decorative strips */}
                  <div className="absolute left-4 top-0 bottom-0 w-4 flex flex-col py-4 space-y-3 opacity-20 mix-blend-overlay">
                    {Array.from({ length: 8 }).map((_, i) => <div key={`fl-${i}`} className="w-full h-8 bg-white rounded-sm" />)}
                  </div>
                  <div className="absolute right-4 top-0 bottom-0 w-4 flex flex-col py-4 space-y-3 opacity-20 mix-blend-overlay">
                    {Array.from({ length: 8 }).map((_, i) => <div key={`fr-${i}`} className="w-full h-8 bg-white rounded-sm" />)}
                  </div>

                  {/* Center icon — camera */}
                  <div className="absolute inset-0 flex items-center justify-center p-6">
                    <div className="w-32 h-28 bg-slate-900 rounded-md shadow-2xl relative flex flex-col overflow-hidden rotate-[-4deg] border border-slate-700 drop-shadow-xl">
                      <div className="h-7 w-full relative overflow-hidden border-b-2 border-slate-800 z-10 shrink-0">
                        <div className="flex w-[150%] h-full -ml-6">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div key={`clap-${i}`} className={`w-8 h-full transform -skew-x-[35deg] ${i % 2 === 0 ? "bg-slate-200" : "bg-slate-950"}`} />
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col p-2 bg-slate-800 shadow-inner relative justify-center items-center">
                        <div className="text-4xl mt-3 drop-shadow-lg">📷</div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute bottom-8 left-0 right-0 text-center font-black text-xl text-slate-200 uppercase tracking-[0.2em] shadow-black drop-shadow-lg">
                    Photo Pack
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-slate-600 to-slate-500 rounded-b-lg overflow-hidden flex">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div key={`crimp-b-${i}`} className="flex-1 border-r border-slate-700/30" />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* CONTROLS */}
        <div className="min-h-[120px] flex items-center justify-center w-full z-40 mt-8">
          <AnimatePresence mode="wait">
            {packState === "revealing" && flippedCards[activeCardIndex] && (
              <div className="flex flex-col items-center gap-4">
                <motion.button
                  key="next-btn"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onClick={handleNextCard}
                  className="group flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold py-3 px-8 rounded-full shadow-lg transition-all"
                >
                  {activeCardIndex < cards.length - 1 ? "Next Card" : "Finish"}
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </motion.button>
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  whileHover={{ opacity: 1 }}
                  onClick={handleSkipAll}
                  className="text-white/40 hover:text-white/90 text-[10px] font-black uppercase tracking-[0.3em] transition-all h-8"
                >
                  Skip to End
                </motion.button>
              </div>
            )}

            {packState === "done" && (
              <motion.div
                key="done-controls"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6"
              >
                <button
                  onClick={resetPack}
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white p-3 rounded-full shadow-lg transition-all group"
                  title="Close Pack"
                >
                  <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <button
                    onClick={() => setIsGridView(true)}
                    className="group flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold py-3 px-6 rounded-full shadow-lg transition-all"
                  >
                    <LayoutGrid className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    View Details
                  </button>
                  <button
                    onClick={resetPack}
                    className="group flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold py-3 px-6 rounded-full shadow-lg hover:shadow-pink-500/25 transition-all transform hover:scale-105 active:scale-95"
                  >
                    <RefreshCcw className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" />
                    Open Another
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* GRID / COLLECTION OVERLAY */}
      <AnimatePresence>
        {(isGridView || isCollectionView) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-xl flex flex-col items-center p-6 sm:p-12 overflow-y-auto"
          >
            <button
              onClick={() => { setIsGridView(false); setIsCollectionView(false); }}
              className="absolute top-4 right-4 sm:top-8 sm:right-8 z-50 group flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold p-2 sm:p-3 rounded-full shadow-lg transition-all"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
            </button>

            <div className="w-full max-w-5xl flex flex-col items-center pb-24 mt-8 sm:mt-0">
              <h2 className="text-3xl font-bold mt-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-4 sm:mb-8">
                {isCollectionView ? "My Collection" : "Pack Review"}
              </h2>

              {isCollectionView && (
                <div className="flex flex-col sm:flex-row items-center justify-between w-full max-w-xs sm:max-w-2xl bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-6 mb-8 gap-4 shadow-xl">
                  <div className="flex flex-col items-center sm:items-start w-full sm:w-auto shrink-0">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">Total Cards</span>
                    <span className="text-2xl font-black text-white">{collection.length}</span>
                  </div>

                  <div className="h-px sm:h-12 w-full sm:w-px bg-white/10" />

                  <div className="flex flex-col items-center sm:items-start w-full sm:w-auto relative flex-1">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">Sort By</span>
                    <div className="relative w-full">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="appearance-none w-full bg-black/40 border border-white/20 text-white font-medium text-sm rounded-lg pl-3 pr-8 py-2 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all cursor-pointer hover:bg-black/60 shadow-inner"
                      >
                        <option value="rarity_high">Highest Rarity</option>
                        <option value="rarity_low">Lowest Rarity</option>
                        <option value="views_high">Most Views</option>
                        <option value="views_low">Least Views</option>
                        <option value="favorites_high">Most Favorites</option>
                        <option value="favorites_low">Least Favorites</option>
                        <option value="name_asc">Name (A-Z)</option>
                        <option value="name_desc">Name (Z-A)</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white/70">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="h-px sm:h-12 w-full sm:w-px bg-white/10 shrink-0" />

                  <div className="flex flex-col items-center sm:items-start w-full sm:w-auto shrink-0">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">Size</span>
                    <div className="flex bg-black/40 border border-white/20 rounded-lg p-1">
                      <button onClick={() => setGridSize("sm")} className={`px-3 py-1 text-xs font-bold rounded ${gridSize === "sm" ? "bg-white/20 text-white" : "text-white/50 hover:text-white transition-colors"}`}>S</button>
                      <button onClick={() => setGridSize("md")} className={`px-3 py-1 text-xs font-bold rounded ${gridSize === "md" ? "bg-white/20 text-white" : "text-white/50 hover:text-white transition-colors"}`}>M</button>
                      <button onClick={() => setGridSize("lg")} className={`px-3 py-1 text-xs font-bold rounded ${gridSize === "lg" ? "bg-white/20 text-white" : "text-white/50 hover:text-white transition-colors"}`}>L</button>
                    </div>
                  </div>

                  <div className="h-px sm:h-12 w-full sm:w-px bg-white/10 shrink-0" />

                  <div className="flex flex-col items-center sm:items-start w-full sm:w-auto shrink-0">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">Collection</span>
                    <button
                      onClick={clearCollection}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                        confirmClear
                          ? "bg-red-600/30 border-red-500/70 text-red-400 animate-pulse"
                          : "bg-black/40 border-white/20 text-white/60 hover:text-red-400 hover:border-red-500/50 hover:bg-red-950/30"
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {confirmClear ? "Sure?" : "Clear"}
                    </button>
                  </div>
                </div>
              )}

              {!isCollectionView && <div className="mb-8" />}

              {isCollectionView && collection.length === 0 && (
                <div className="text-center text-white/50 mt-12 flex flex-col items-center">
                  <div className="w-24 h-32 border-2 border-dashed border-white/20 rounded-xl mb-4 flex items-center justify-center">
                    <span className="text-4xl text-white/20">?</span>
                  </div>
                  <p>Your collection is empty.</p>
                  <p className="text-sm">Open some packs to find cards!</p>
                </div>
              )}

              <div className={`grid gap-2 sm:gap-4 justify-items-center w-full max-w-7xl mx-auto ${
                gridSize === "sm" ? "grid-cols-2 min-[500px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" :
                gridSize === "md" ? "grid-cols-2 min-[500px]:grid-cols-3" :
                "grid-cols-1 min-[500px]:grid-cols-2"
              }`}>
                {(isCollectionView
                  ? getGroupedCollection(getSortedCards(collection))
                  : getSortedCards(cards).map((c) => ({ card: c, count: 1 }))
                ).map((item, idx) => {
                  const { card, count } = item;
                  const col = getRarityColors(card.rarity);
                  const dims = gridSize === "sm"
                    ? { container: "w-[184px] h-[230px]", content: "w-[368px] h-[461px]", scale: 184 / 368 }
                    : gridSize === "md"
                      ? { container: "w-[276px] h-[345px]", content: "w-[368px] h-[461px]", scale: 276 / 368 }
                      : { container: "w-[200px] h-[250px] sm:w-[280px] sm:h-[350px] lg:w-[368px] lg:h-[461px]", content: "w-full h-full", scale: 1 };

                  return (
                    <motion.div
                      key={`grid-${card.id}-${idx}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: (idx % 10) * 0.05 }}
                      className={`relative ${dims.container} group transition-transform hover:scale-105 ${isCollectionView ? "cursor-pointer" : ""}`}
                      onClick={() => isCollectionView && window.open(card.sourceUrl, "_blank")}
                    >
                      {isCollectionView && count > 1 && (
                        <div className="absolute -top-2 -right-2 z-30 bg-purple-600 text-white text-xs font-black px-2 py-1 rounded-full shadow-lg border border-white/20">
                          x{count}
                        </div>
                      )}
                      <div
                        className={`${dims.content} origin-top-left`}
                        style={{ transform: dims.scale !== 1 ? `scale(${dims.scale})` : "none" }}
                      >
                        <div className={`w-full h-full bg-gradient-to-br ${col.bg} rounded-xl p-0.5 sm:p-1 shadow-2xl relative`}>
                          <div className={`w-full h-full border sm:border-2 ${col.border} rounded-lg flex flex-col bg-black/50 backdrop-blur-sm relative overflow-hidden`}>
                            {/* Image fill */}
                            {card.imageUrl && (
                              <div
                                className="absolute inset-0 bg-cover bg-center opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                                style={{ backgroundImage: `url(${card.imageUrl})` }}
                              />
                            )}

                            {/* Top gradient + rarity */}
                            <div className="relative z-10 flex justify-between items-start w-full p-2 sm:p-3 bg-gradient-to-b from-black/80 to-transparent">
                              <div className="bg-black/50 backdrop-blur rounded px-1.5 py-0.5 sm:px-2 sm:py-1 flex items-center gap-0.5 sm:gap-1">
                                <Sparkles className={`w-2 h-2 sm:w-3 sm:h-3 lg:w-4 lg:h-4 ${col.icon}`} />
                                <span className={`text-[8px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-wider ${col.text}`}>{card.rarity}</span>
                              </div>
                              {!isCollectionView && newCardIds.has(card.id) && (
                                <div className="absolute top-10 left-2 bg-red-600 text-white text-[8px] sm:text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg uppercase">
                                  New!
                                </div>
                              )}
                              <div className="bg-black/50 backdrop-blur rounded px-1.5 py-0.5 sm:px-2 sm:py-1">
                                <span className="text-white/80 font-bold text-[10px] sm:text-xs lg:text-sm">👁 {formatCount(card.views)}</span>
                              </div>
                            </div>

                            {/* Bottom: title + favorites */}
                            <div className="relative z-10 mt-auto p-2 sm:p-4 w-full flex flex-col items-center bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                              <ScrollableTitle title={card.name} baseClass="text-xs sm:text-sm lg:text-lg font-black text-white uppercase tracking-tight drop-shadow-md leading-tight" />
                              <span className="text-pink-400 font-bold text-[10px] sm:text-xs">❤️ {formatCount(card.favorites)}</span>
                            </div>
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-50 mix-blend-overlay rounded-xl pointer-events-none" />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
