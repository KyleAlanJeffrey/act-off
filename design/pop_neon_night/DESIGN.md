---
name: Pop-Neon Night
colors:
  surface: '#100f2f'
  surface-dim: '#100f2f'
  surface-bright: '#363657'
  surface-container-lowest: '#0a0a2a'
  surface-container-low: '#181838'
  surface-container: '#1c1c3c'
  surface-container-high: '#272747'
  surface-container-highest: '#313153'
  on-surface: '#e2dfff'
  on-surface-variant: '#d4c0d7'
  inverse-surface: '#e2dfff'
  inverse-on-surface: '#2d2d4e'
  outline: '#9d8ba0'
  outline-variant: '#514255'
  surface-tint: '#ecb2ff'
  primary: '#ecb2ff'
  on-primary: '#520071'
  primary-container: '#bd00ff'
  on-primary-container: '#ffffff'
  inverse-primary: '#9900cf'
  secondary: '#d3fbff'
  on-secondary: '#00363a'
  secondary-container: '#00eefc'
  on-secondary-container: '#00686f'
  tertiary: '#94db00'
  on-tertiary: '#223600'
  tertiary-container: '#568200'
  on-tertiary-container: '#fffeff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#f8d8ff'
  primary-fixed-dim: '#ecb2ff'
  on-primary-fixed: '#320047'
  on-primary-fixed-variant: '#74009f'
  secondary-fixed: '#7df4ff'
  secondary-fixed-dim: '#00dbe9'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#a9f900'
  tertiary-fixed-dim: '#94db00'
  on-tertiary-fixed: '#121f00'
  on-tertiary-fixed-variant: '#334f00'
  background: '#100f2f'
  on-background: '#e2dfff'
  surface-variant: '#313153'
typography:
  display-lg:
    fontFamily: Syne
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-md:
    fontFamily: Syne
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg:
    fontFamily: Syne
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Syne
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Quicksand
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Quicksand
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  label-lg:
    fontFamily: Quicksand
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Quicksand
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  container-max: 1200px
---

## Brand & Style

This design system shifts away from a professional studio atmosphere toward an enthusiastic, high-energy "backstage karaoke party" aesthetic. It targets social gamers and late-night party-goers who crave a vibrant, immersive digital environment.

The style is **High-Contrast / Bold** mixed with **Modern Brutalism**. It utilizes a deep, nocturnal background to let neon accents radiate. UI elements are defined by thick borders and hyper-rounded corners, creating a "bubbly" yet structured feel that feels approachable and celebratory. The emotional response is one of excitement, inclusivity, and shared energy.

## Colors

The palette is anchored in a "Pop-Neon Night" theme.
- **Backgrounds:** Use a deep indigo-purple (#1A1A3A) rather than pure black or charcoal to maintain a "night party" depth.
- **Primary (Hot Pink):** Used for main actions, active states, and high-energy touchpoints.
- **Secondary (Electric Cyan):** Used for interactive secondary elements and information clarity.
- **Tertiary (Bright Lime):** Reserved for success states, confirmations, and "Go" signals.
- **Marquee Gold:** Specifically reserved for winner highlights, trophies, and premium "VIP" moments.
- **Contrast:** Every interactive element must maintain high contrast against the deep indigo base, often utilizing a white or near-white foreground for maximum legibility.

## Typography

The typography pairing creates a balance between expressive energy and friendly readability.
- **Headlines:** Syne is used for all major headers. To increase playfulness, top-level display titles should occasionally utilize a 2-degree rotation or a "drop-shadow" effect using the secondary neon color to simulate a neon sign glow.
- **UI & Body:** Quicksand provides a soft, rounded, and highly legible experience for all functional text. Its rounded terminals mirror the "bubbly" shape language of the interface.
- **Hierarchy:** Use heavy weights (700-800) for Syne to ensure it "pops" against vibrant backgrounds. Use Medium to Bold for Quicksand to ensure legibility over dark, saturated colors.

## Layout & Spacing

This design system uses a **Fluid Grid** model with generous, breathable margins to prevent the high-energy colors from feeling claustrophobic.
- **Grid:** A 12-column layout on desktop, collapsing to 4 columns on mobile. 
- **Rhythm:** All spacing is based on a 4px baseline unit. 
- **Reflow:** On mobile, components should stack vertically, maximizing the 16px side margins to ensure the "thick borders" of cards have enough room to be visually distinct.
- **Padding:** Internal card padding should be generous (typically 24px or 32px) to support the large border radii and thick outlines.

## Elevation & Depth

Depth in this system is achieved through **Bold Borders** and **Tonal Layering** rather than traditional soft shadows.
- **Outlines:** All primary containers and cards feature a 3px or 4px solid border. The border color should be a slightly lighter version of the background or a vibrant neon accent for "active" states.
- **Stacking:** Surface levels are distinguished by increasing the brightness of the indigo-purple base. Level 1 (Background) is the darkest, while Level 2 (Cards/Modals) is slightly lighter and more saturated.
- **Glow:** Instead of ambient shadows, "high-energy" elements use an outer glow (0px spread, large blur) that matches the neon border color to simulate light emission.

## Shapes

The shape language is "Hyper-Rounded." 
- **Standard Radius:** 16px (1rem) for all standard cards and input fields.
- **Large Radius:** 32px (2rem) for major containers or featured sections.
- **Interactive Elements:** Buttons and tags should utilize a full "Pill-shape" (rounded-full) to maximize the friendly, social aesthetic.
- **Borders:** A mandatory 3px border width applies to all cards to provide the necessary "pop" against the dark background.

## Components

- **Buttons:** Always pill-shaped. Primary buttons use a Hot Pink fill with white text and a 4px "inset" shadow for a squishy, tactile feel. Secondary buttons use a Cyan outline (3px).
- **Cards:** Feature a 16px corner radius and a 3px border in a lighter purple or a neon accent. Backgrounds should be slightly translucent (90% opacity) to allow background neon gradients to peek through.
- **Chips/Tags:** Small pill-shaped elements with Bright Lime backgrounds and black text for maximum "functional" visibility.
- **Input Fields:** Rounded (16px), featuring a thick 2px border that glows Cyan when focused.
- **Winner Highlights:** Elements designated for winners use the "Marquee Gold" color with an animated "marching ants" border or a thick 4px gold stroke and a slight 2-degree tilt.
- **Lists:** Items should be separated by clear vertical gaps (12px) rather than just lines, emphasizing each item as a distinct "rounded" bubble.