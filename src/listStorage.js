const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: data?.message || "Request failed." };
  }
  return data;
};

export const getLists = async () => {
  const data = await requestJson("/api/lists");
  if (data?.error) {
    return { lists: [], error: data.error };
  }
  return { lists: data?.lists || [] };
};

export const createList = async (name) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "List name is required." };
  }
  const data = await requestJson("/api/lists", {
    method: "POST",
    body: JSON.stringify({ name: trimmed }),
  });
  if (data?.error) {
    return { error: data.error };
  }
  return { list: data?.list || null };
};

export const addMovieToList = async (listId, movie) => {
  const payload = {
    tmdbId: movie.id,
    mediaType: movie.mediaType || "movie",
    title: movie.title,
    name: movie.name,
    posterPath: movie.poster_path,
    releaseDate: movie.release_date,
    firstAirDate: movie.first_air_date,
  };
  const data = await requestJson(`/api/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data?.error) {
    return { error: data.error };
  }
  return { ok: true };
};
