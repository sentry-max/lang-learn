/**
 * <logo-sweep-loader>: loading indicator concept 5, "Sweep", for loading with no known
 * duration, buttons and inline use.
 *
 * A fluid spinner: the ring stretches into the full logo and contracts while it
 * orbits, always led by the progress piece.
 *
 * Self-contained: no dependencies, drawn with Canvas 2D and requestAnimationFrame.
 * Importing this file registers the element.
 *
 *   import './logo-sweep-loader';
 *
 *   <logo-sweep-loader size="24"></logo-sweep-loader>
 *
 * Attributes:    size (pixels or any CSS length, default 48px), ring-color, piece-color,
 *                speed (multiplier, default 1), paused
 * CSS variables: --logo-loader-ring-color, --logo-loader-piece-color
 * Methods:       restart()
 * Reduced motion: plays at half speed.
 */

const TAG_NAME = 'logo-sweep-loader';

const DEFAULT_RING_COLOR = '#45AAE3';
const DEFAULT_PIECE_COLOR = '#FFB72B';

// Geometry on the logo's 512 unit grid. The canvas shows the square from 56 to 456.
const VIEW_BOX_ORIGIN = 56;
const VIEW_BOX_SIZE = 400;
const RING_OUTER_RADIUS = 150;
const RING_INNER_RADIUS = 106;
/** Ring center; the spinner orbits around it. */
const CENTER_X = 256;
const CENTER_Y = 256;
const FULL_TURN = Math.PI * 2;
/** At rest the ring starts at 9 o'clock, like the logo. */
const RING_START_ANGLE = Math.PI;
/** The ring stretches between a quarter and three quarters of a turn (three quarters is the full logo). */
const SHORTEST_RING_FRACTION = 0.25;
const LONGEST_RING_FRACTION = 0.75;
/** The piece leads the ring with an 8 degree gap and is 74 degrees long, so at full stretch it closes the circle. */
const PIECE_GAP_ANGLE = (8 * Math.PI) / 180;
const PIECE_SWEEP_ANGLE = (74 * Math.PI) / 180;

const STRETCH_CYCLE_DURATION_MILLISECONDS = 2400;
const ORBIT_DURATION_MILLISECONDS = 3200;
const REDUCED_MOTION_SPEED_FACTOR = 0.5;

/** Longest frame step allowed, so a frozen or background tab does not make the animation jump. */
const MAXIMUM_FRAME_DELTA_MILLISECONDS = 100;
/** How often the CSS variable colors are re-read, so theme switches are picked up. */
const COLOR_REFRESH_INTERVAL_MILLISECONDS = 500;

const SHADOW_STYLES = `
:host { display: inline-block; width: 48px; height: 48px; vertical-align: middle; contain: content; }
:host([hidden]) { display: none; }
canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
`;

type EasingFunction = (progress: number) => number;

/** Equivalent of CSS cubic-bezier(). */
function createCubicBezierEasing(
  firstControlX: number,
  firstControlY: number,
  secondControlX: number,
  secondControlY: number,
): EasingFunction {
  const coefficientCX = 3 * firstControlX;
  const coefficientBX = 3 * (secondControlX - firstControlX) - coefficientCX;
  const coefficientAX = 1 - coefficientCX - coefficientBX;
  const coefficientCY = 3 * firstControlY;
  const coefficientBY = 3 * (secondControlY - firstControlY) - coefficientCY;
  const coefficientAY = 1 - coefficientCY - coefficientBY;
  const sampleCurveX = (parameter: number): number =>
    ((coefficientAX * parameter + coefficientBX) * parameter + coefficientCX) * parameter;
  const sampleCurveY = (parameter: number): number =>
    ((coefficientAY * parameter + coefficientBY) * parameter + coefficientCY) * parameter;
  const sampleCurveDerivativeX = (parameter: number): number =>
    (3 * coefficientAX * parameter + 2 * coefficientBX) * parameter + coefficientCX;

  const solveCurveX = (targetX: number): number => {
    let parameter = targetX;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const error = sampleCurveX(parameter) - targetX;
      if (Math.abs(error) < 1e-6) {
        return parameter;
      }
      const derivative = sampleCurveDerivativeX(parameter);
      if (Math.abs(derivative) < 1e-6) {
        break;
      }
      parameter -= error / derivative;
    }
    let lowerBound = 0;
    let upperBound = 1;
    parameter = targetX;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const sampledX = sampleCurveX(parameter);
      if (Math.abs(sampledX - targetX) < 1e-6) {
        return parameter;
      }
      if (targetX > sampledX) {
        lowerBound = parameter;
      } else {
        upperBound = parameter;
      }
      parameter = (lowerBound + upperBound) / 2;
    }
    return parameter;
  };

  return (progress: number): number => {
    if (progress <= 0) {
      return 0;
    }
    if (progress >= 1) {
      return 1;
    }
    return sampleCurveY(solveCurveX(progress));
  };
}

const easeStandardInOut = createCubicBezierEasing(0.65, 0, 0.35, 1);

/** Fills part of the ring between two angles (clockwise from 3 o'clock), with radial cut ends. */
function fillAnnularSector(
  context: CanvasRenderingContext2D,
  startAngle: number,
  endAngle: number,
  color: string,
): void {
  context.beginPath();
  context.arc(CENTER_X, CENTER_Y, RING_OUTER_RADIUS, startAngle, endAngle, false);
  context.arc(CENTER_X, CENTER_Y, RING_INNER_RADIUS, endAngle, startAngle, true);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

/** Lets the file be imported during server-side rendering, where HTMLElement does not exist. */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

export class LogoSweepLoader extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ['size', 'ring-color', 'piece-color', 'speed', 'paused'];
  }

  private readonly canvasElement: HTMLCanvasElement;
  private readonly drawingContext: CanvasRenderingContext2D;
  private ringColor = DEFAULT_RING_COLOR;
  private pieceColor = DEFAULT_PIECE_COLOR;
  private prefersReducedMotion = false;
  private elapsedMilliseconds = 0;
  private animationFrameHandle: number | null = null;
  private previousFrameTimestamp: number | null = null;
  private lastColorRefreshTimestamp = Number.NEGATIVE_INFINITY;
  private cssPixelWidth = 0;
  private cssPixelHeight = 0;
  private isOnScreen = true;
  private isSizeAppliedFromAttribute = false;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private reducedMotionQuery: MediaQueryList | null = null;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    const styleElement = document.createElement('style');
    styleElement.textContent = SHADOW_STYLES;
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.setAttribute('aria-hidden', 'true');
    shadowRoot.append(styleElement, this.canvasElement);
    const context = this.canvasElement.getContext('2d');
    if (context === null) {
      throw new Error('Canvas 2D rendering is not available in this browser.');
    }
    this.drawingContext = context;
  }

  get paused(): boolean {
    return this.hasAttribute('paused');
  }

  set paused(isPaused: boolean) {
    this.toggleAttribute('paused', Boolean(isPaused));
  }

  get speed(): number {
    const speedAttribute = Number.parseFloat(this.getAttribute('speed') ?? '');
    return Number.isFinite(speedAttribute) && speedAttribute > 0 ? speedAttribute : 1;
  }

  set speed(speedMultiplier: number) {
    this.setAttribute('speed', String(speedMultiplier));
  }

  /** Starts the animation again from its first frame. */
  restart(): void {
    this.elapsedMilliseconds = 0;
    this.requestRender();
  }

  connectedCallback(): void {
    this.upgradeProperty('paused');
    this.upgradeProperty('speed');
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      this.setAttribute('aria-label', 'Loading');
    }
    this.applySizeAttribute();

    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = this.reducedMotionQuery.matches;
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotionChange);
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this);
    this.intersectionObserver = new IntersectionObserver(this.handleIntersection);
    this.intersectionObserver.observe(this);

    this.refreshColors();
    this.requestRender();
  }

  disconnectedCallback(): void {
    if (this.animationFrameHandle !== null) {
      cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = null;
    }
    this.previousFrameTimestamp = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.reducedMotionQuery?.removeEventListener('change', this.handleReducedMotionChange);
    this.reducedMotionQuery = null;
  }

  attributeChangedCallback(attributeName: string): void {
    if (!this.isConnected) {
      return;
    }
    if (attributeName === 'size') {
      this.applySizeAttribute();
    }
    if (attributeName === 'ring-color' || attributeName === 'piece-color') {
      this.refreshColors();
    }
    this.requestRender();
  }

  private renderFrame(context: CanvasRenderingContext2D): void {
    const orbitAngle =
      FULL_TURN * ((this.elapsedMilliseconds % ORBIT_DURATION_MILLISECONDS) / ORBIT_DURATION_MILLISECONDS);
    const cycleTime =
      (this.elapsedMilliseconds % STRETCH_CYCLE_DURATION_MILLISECONDS) / STRETCH_CYCLE_DURATION_MILLISECONDS;

    // Four segments per cycle: stretch, contract, stretch, contract.
    const segmentIndex = Math.min(3, Math.floor(cycleTime * 4));
    const easedSegmentProgress = easeStandardInOut(cycleTime * 4 - segmentIndex);
    const stretchRange = LONGEST_RING_FRACTION - SHORTEST_RING_FRACTION;
    const isStretching = segmentIndex % 2 === 0;
    const ringFraction = isStretching
      ? SHORTEST_RING_FRACTION + stretchRange * easedSegmentProgress
      : LONGEST_RING_FRACTION - stretchRange * easedSegmentProgress;

    // While contracting, the tail catches up: the whole shape turns by as much as the ring shrinks,
    // so the leading edge and the piece hold still relative to the orbit.
    const tailAdvanceAngle = FULL_TURN * stretchRange;
    let phaseAngle: number;
    if (segmentIndex === 0) {
      phaseAngle = 0;
    } else if (segmentIndex === 1) {
      phaseAngle = tailAdvanceAngle * easedSegmentProgress;
    } else if (segmentIndex === 2) {
      phaseAngle = tailAdvanceAngle;
    } else {
      phaseAngle = tailAdvanceAngle + tailAdvanceAngle * easedSegmentProgress;
    }

    const ringStartAngle = RING_START_ANGLE + orbitAngle + phaseAngle;
    const ringEndAngle = ringStartAngle + FULL_TURN * ringFraction;
    fillAnnularSector(context, ringStartAngle, ringEndAngle, this.ringColor);

    const pieceStartAngle = ringEndAngle + PIECE_GAP_ANGLE;
    fillAnnularSector(context, pieceStartAngle, pieceStartAngle + PIECE_SWEEP_ANGLE, this.pieceColor);
  }

  private requestRender(): void {
    if (!this.isConnected || this.animationFrameHandle !== null) {
      return;
    }
    this.animationFrameHandle = requestAnimationFrame(this.handleAnimationFrame);
  }

  private readonly handleAnimationFrame = (timestamp: number): void => {
    this.animationFrameHandle = null;
    const frameDelta =
      this.previousFrameTimestamp === null
        ? 0
        : Math.min(timestamp - this.previousFrameTimestamp, MAXIMUM_FRAME_DELTA_MILLISECONDS);
    this.previousFrameTimestamp = timestamp;

    const isRunning = this.isConnected && this.isOnScreen && !this.paused;
    if (isRunning) {
      const motionFactor = this.prefersReducedMotion ? REDUCED_MOTION_SPEED_FACTOR : 1;
      this.elapsedMilliseconds += frameDelta * this.speed * motionFactor;
    }
    if (timestamp - this.lastColorRefreshTimestamp > COLOR_REFRESH_INTERVAL_MILLISECONDS) {
      this.lastColorRefreshTimestamp = timestamp;
      this.refreshColors();
    }
    if (this.prepareCanvas()) {
      this.renderFrame(this.drawingContext);
    }

    if (isRunning) {
      this.animationFrameHandle = requestAnimationFrame(this.handleAnimationFrame);
    } else {
      this.previousFrameTimestamp = null;
    }
  };

  /** Matches the canvas to the element size and screen density, clears it and sets the design scale. */
  private prepareCanvas(): boolean {
    const cssSize = Math.min(this.cssPixelWidth, this.cssPixelHeight);
    if (cssSize <= 0) {
      return false;
    }
    const pixelSize = Math.max(1, Math.round(cssSize * (window.devicePixelRatio || 1)));
    if (this.canvasElement.width !== pixelSize || this.canvasElement.height !== pixelSize) {
      this.canvasElement.width = pixelSize;
      this.canvasElement.height = pixelSize;
    }
    const context = this.drawingContext;
    const designScale = pixelSize / VIEW_BOX_SIZE;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, pixelSize, pixelSize);
    context.setTransform(designScale, 0, 0, designScale, -VIEW_BOX_ORIGIN * designScale, -VIEW_BOX_ORIGIN * designScale);
    return true;
  }

  private refreshColors(): void {
    if (!this.isConnected) {
      return;
    }
    const computedStyle = getComputedStyle(this);
    const nextRingColor =
      this.getAttribute('ring-color')?.trim() ||
      computedStyle.getPropertyValue('--logo-loader-ring-color').trim() ||
      DEFAULT_RING_COLOR;
    const nextPieceColor =
      this.getAttribute('piece-color')?.trim() ||
      computedStyle.getPropertyValue('--logo-loader-piece-color').trim() ||
      DEFAULT_PIECE_COLOR;
    if (nextRingColor !== this.ringColor || nextPieceColor !== this.pieceColor) {
      this.ringColor = nextRingColor;
      this.pieceColor = nextPieceColor;
      this.requestRender();
    }
  }

  private applySizeAttribute(): void {
    const sizeAttribute = this.getAttribute('size')?.trim() ?? '';
    if (sizeAttribute === '') {
      if (this.isSizeAppliedFromAttribute) {
        this.style.removeProperty('width');
        this.style.removeProperty('height');
        this.isSizeAppliedFromAttribute = false;
      }
      return;
    }
    const cssLength = /^\d+(\.\d+)?$/.test(sizeAttribute) ? `${sizeAttribute}px` : sizeAttribute;
    this.style.width = cssLength;
    this.style.height = cssLength;
    this.isSizeAppliedFromAttribute = true;
  }

  /** Re-applies a property set before the element was upgraded (for example by a framework). */
  private upgradeProperty(propertyName: string): void {
    if (Object.prototype.hasOwnProperty.call(this, propertyName)) {
      const instance = this as unknown as Record<string, unknown>;
      const pendingValue = instance[propertyName];
      delete instance[propertyName];
      instance[propertyName] = pendingValue;
    }
  }

  private readonly handleResize = (entries: ResizeObserverEntry[]): void => {
    const latestEntry = entries[entries.length - 1];
    if (latestEntry === undefined) {
      return;
    }
    this.cssPixelWidth = latestEntry.contentRect.width;
    this.cssPixelHeight = latestEntry.contentRect.height;
    this.requestRender();
  };

  private readonly handleIntersection = (entries: IntersectionObserverEntry[]): void => {
    const latestEntry = entries[entries.length - 1];
    if (latestEntry === undefined) {
      return;
    }
    this.isOnScreen = latestEntry.isIntersecting;
    if (this.isOnScreen) {
      this.requestRender();
    }
  };

  private readonly handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion = event.matches;
    this.requestRender();
  };
}

if (typeof customElements !== 'undefined' && customElements.get(TAG_NAME) === undefined) {
  customElements.define(TAG_NAME, LogoSweepLoader);
}

declare global {
  interface HTMLElementTagNameMap {
    'logo-sweep-loader': LogoSweepLoader;
  }
}
