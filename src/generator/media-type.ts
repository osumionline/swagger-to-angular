/**
 * Context in which a media type is used.
 */
type MediaTypeUsage = 'request' | 'response';

/**
 * Supported HTTP body representation.
 */
type MediaTypeKind = 'json' | 'text' | 'binary';

/**
 * A media type selected from an OpenAPI content object.
 */
interface SelectedMediaType {
  name: string;
  kind: MediaTypeKind;
}

/**
 * Supported media type classification and priority.
 */
interface MediaTypeCandidate {
  pattern: RegExp;
  kind: MediaTypeKind;
  responseOnly?: boolean;
}

/**
 * Preferred media types, ordered by priority.
 *
 * Wildcard subtypes such as application/*+json are
 * intentionally not selected as concrete request formats.
 */
const MEDIA_TYPE_PRIORITY: readonly MediaTypeCandidate[] = [
  {
    pattern: /^application\/json$/,
    kind: 'json',
  },
  {
    pattern: /^application\/[a-z0-9!#$&^_.+-]+\+json$/,
    kind: 'json',
  },
  {
    pattern: /^text\/json$/,
    kind: 'json',
  },
  {
    pattern: /^text\/plain$/,
    kind: 'text',
  },
  {
    pattern: /^application\/pdf$/,
    kind: 'binary',
    responseOnly: true,
  },
  {
    pattern: /^application\/octet-stream$/,
    kind: 'binary',
  },
];

/**
 * Extracts the MIME type without optional parameters.
 *
 * The original media type is retained separately for
 * Content-Type and Accept headers.
 *
 * @param name Media type including optional parameters.
 * @returns Lowercase MIME type without parameters.
 */
function getBaseMediaType(name: string): string {
  return (name.split(';', 1)[0] ?? '').trim().toLowerCase();
}

/**
 * Selects a supported media type from an OpenAPI
 * request or response content object.
 *
 * Selection does not depend on declaration order when
 * the available types have different priorities.
 *
 * Media type parameters are ignored for classification
 * but preserved in the returned name.
 *
 * @param mediaTypes Declared OpenAPI media types.
 * @param usage Whether the body is sent or received.
 * @returns Selected media type or undefined if unsupported.
 */
export default function selectMediaType(
  mediaTypes: readonly string[],
  usage: MediaTypeUsage,
): SelectedMediaType | undefined {
  for (const candidate of MEDIA_TYPE_PRIORITY) {
    if (usage === 'request' && candidate.responseOnly === true) {
      continue;
    }

    const name: string | undefined = mediaTypes.find(
      (mediaType: string): boolean => {
        return candidate.pattern.test(getBaseMediaType(mediaType));
      },
    );

    if (name !== undefined) {
      return {
        name,
        kind: candidate.kind,
      };
    }
  }

  return undefined;
}
