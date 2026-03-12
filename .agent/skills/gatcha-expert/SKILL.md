---
name: Gatcha Implementation Expert
description: Specialized skills for developing movie gatcha mechanics, animations, and TMDB integration.
---

# Gatcha Implementation Expert Skill

This skill provides patterns and instructions for maintaining the core gatcha mechanics, animations, and movie data integration for the `p-gatcha-app`.

## Core Mechanics
- **Reveal Order**: Always sort movies by rarity (Common -> Legendary) before the reveal animation to build tension.
- **Rarity Thresholds**:
  - Legendary: >= 8.5
  - Epic: >= 7.5
  - Rare: >= 6.5
  - Uncommon: >= 5.5
  - Common: < 5.5

## UI & Animations
- **Framer Motion**: Use `framer-motion` for Card Reveal animations.
- **Micro-Animations**: Implement hover scales (1.05) and subtle glows on Legendary/Epic cards.
- **Confetti**: Trigger `canvas-confetti` ONLY on Legendary pulls.

## TMDB Best Practices
- **Image URLs**: Use `https://image.tmdb.org/t/p/w500` for posters and `original` for high-quality backgrounds.
- **Fallbacks**: Always provide a fallback title and description if TMDB data is missing.
- **Optimization**: Parallelize TMDB detail fetches for better performance.
