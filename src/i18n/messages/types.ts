import type { PluralForms } from '../locales.ts';

// Everything the viewer script needs in the browser. It travels as JSON on the dialog (data-messages), so it holds only
// strings.
export interface ViewerScriptMessages {
  readonly unknown: string;
  readonly notPublished: string;
  readonly notLoaded: string;
  readonly loading: string;
  readonly imageFailed: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  // "{{n}} bytes": {{n}} is the byte count, already formatted for the locale.
  readonly bytes: string;
}

export interface Messages {
  readonly siteDescription: string;
  readonly header: {
    readonly language: string;
    readonly theme: string;
    readonly themeSystem: string;
    readonly themeLight: string;
    readonly themeDark: string;
  };
  readonly home: {
    readonly lede: string;
    readonly browse: string;
    readonly albumsHeading: string;
    readonly empty: string;
  };
  readonly images: PluralForms;
  readonly albums: PluralForms;
  readonly notFound: {
    readonly title: string;
    readonly description: string;
    readonly body: string;
    readonly back: string;
  };
  readonly album: {
    readonly nav: string;
    readonly back: string;
    readonly thumbnailSize: string;
    readonly small: string;
    readonly medium: string;
    readonly large: string;
  };
  readonly viewer: ViewerScriptMessages & {
    readonly zoomTitle: string;
    readonly details: string;
    readonly detailsTitle: string;
    readonly close: string;
    readonly closeTitle: string;
    readonly previous: string;
    readonly previousTitle: string;
    readonly next: string;
    readonly nextTitle: string;
    readonly panelLabel: string;
    readonly key: string;
    readonly pixelSize: string;
    readonly byteSize: string;
    readonly positivePrompt: string;
    readonly negativePrompt: string;
    readonly seed: string;
    readonly generated: string;
  };
}
