import 'vitest';

import type {
  ParserResponse,
  ParserResponseType,
} from '../parsers/parser-types.js';

declare global {
  namespace Chai {
    interface Assertion {
      /**
       * Asserts that the response is a success response.
       * @param [errorMessage] - **Optional** custom error message to display on failure.
       */
      successResponse(errorMessage?: string): void;

      /**
       * Asserts that the response is an error response.
       * @param [errorMessage] - **Optional** custom error message to display on failure.
       */
      errorResponse(errorMessage?: string): void;
    }

    interface Assert {
      /**
       * Asserts that the given object is a success response.
       * @template ActualType - The type of the object being checked.
       * @param thing - The object to check.
       * @param [errorMessage] - **Optional** custom error message to display on failure.
       */
      isSuccessResponse<ActualType extends ParserResponse>(
        thing: ActualType,
        errorMessage?: string,
      ): asserts thing is Extract<
        ActualType,
        { type: ParserResponseType.NoError }
      >;

      /**
       * Asserts that the given object is not a success response.
       *
       * @template ActualType - The type of the object being checked.
       * @param thing - The object to check.
       * @param [errorMessage] - **Optional** custom error message to display on failure.
       */
      isNotSuccessResponse<ActualType>(
        thing: ActualType,
        errorMessage?: string,
      ): asserts thing is Exclude<
        ActualType,
        { type: ParserResponseType.NoError }
      >;

      /**
       * Asserts that the given object is an error response.
       * @template ActualType - The type of the object being checked.
       * @param thing - The object to check.
       * @param [errorMessage] - **Optional** custom error message to display on failure.
       */
      isErrorResponse<ActualType extends ParserResponse>(
        thing: ActualType,
        errorMessage?: string,
      ): asserts thing is Extract<
        ActualType,
        { type: ParserResponseType.Error }
      >;

      /**
       * Asserts that the given object is not an error response.
       * @template ActualType - The type of the object being checked.
       * @param thing - The object to check.
       * @param [errorMessage] - **Optional** custom error message to display on failure.
       */
      isNotErrorResponse<ActualType>(
        thing: ActualType,
        errorMessage?: string,
      ): asserts thing is Exclude<
        ActualType,
        { type: ParserResponseType.Error }
      >;
    }
  }
}
