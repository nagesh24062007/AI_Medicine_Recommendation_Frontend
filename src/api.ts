import type {
  ApiError,
  ApiValidationErrorDetail,
  PredictionSuccessResponse,
} from "./types";

const PREDICT_API_URL = "/api/predict";
const REQUEST_TIMEOUT_MS = 10000;

export async function predictSymptoms(
  symptoms: string[]
): Promise<PredictionSuccessResponse> {
  if (!symptoms || symptoms.length === 0) {
    const error: ApiError = {
      type: "validation",
      message: "Please select at least one symptom before running the analysis.",
      invalidSymptoms: [],
    };
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PREDICT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ symptoms }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as PredictionSuccessResponse;
      return data;
    }

    if (response.status === 422) {
      let detail: ApiValidationErrorDetail | undefined;
      try {
        const errorJson = await response.json();
        detail = errorJson.detail;
      } catch {
        // Fallback if response is not JSON
      }

      const error: ApiError = {
        type: "validation",
        statusCode: 422,
        message:
          detail?.message ||
          "Some symptoms were not recognized by the machine learning model.",
        invalidSymptoms: detail?.invalid_symptoms || [],
      };
      throw error;
    }

    // Other HTTP errors (500, 502, 404, etc.)
    let errorMessage = `Server returned status ${response.status} (${response.statusText}).`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail && typeof errorJson.detail === "string") {
        errorMessage = errorJson.detail;
      }
    } catch {
      // Keep default message
    }

    const error: ApiError = {
      type: "server",
      statusCode: response.status,
      message: errorMessage,
    };
    throw error;
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    // If it's already an ApiError, rethrow
    if (
      err &&
      typeof err === "object" &&
      "type" in err &&
      "message" in err
    ) {
      throw err as ApiError;
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      const error: ApiError = {
        type: "connection",
        message:
          "Request timed out after 10 seconds. The backend server might be busy or unreachable.",
      };
      throw error;
    }

    const error: ApiError = {
      type: "connection",
      message:
        "Unable to connect to the prediction backend service. Ensure the FastAPI server is running on http://127.0.0.1:8000.",
    };
    throw error;
  }
}
