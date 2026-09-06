import type { Plugin } from 'vite';
export declare function bakeLandingPlugin(): Plugin;
export declare const FAST_LANDING_START: string;
export declare const FAST_LANDING_END: string;
export declare function extractFastLandingSource(moduleSource: string): string;
export declare function buildHomeBoot(fastLandingSource: string): string;
export declare function stripScripts(html: string): string;
