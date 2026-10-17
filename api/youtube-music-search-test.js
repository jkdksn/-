import { Innertube } from "youtubei.js";

export default async function handler(req, res) {
  try {
    const query = req.query?.q || "";

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "검색어가 없습니다."
      });
    }

    const youtube = await Innertube.create({
      lang: "ko",
      location: "KR"
    });

    const search = await youtube.music.search(
      query,
      {
        type: "song"
      }
    );

    const shelves = search?.contents || [];

    const results = [];

    for (const shelf of shelves) {

      const shelfContents =
        shelf?.contents || [];

      for (const item of shelfContents) {

        results.push({
          type:
            item?.constructor?.name || "",

          id:
            item?.id || "",

          title:
            getText(item?.title),

          artist:
            getArtist(item),

          artists:
            Array.isArray(item?.artists)
              ? item.artists.map(
                  artist =>
                    getText(artist)
                )
              : [],

          album:
            getText(item?.album),

          duration:
            getDuration(item),

          subtitle:
            getText(item?.subtitle),

          flexColumns:
            item?.flex_columns
              ? String(item.flex_columns)
              : "",

          fixedColumns:
            item?.fixed_columns
              ? String(item.fixed_columns)
              : ""
        });

      }
    }

    return res.status(200).json({
      success: true,

      query,

      shelfCount:
        shelves.length,

      shelves: shelves.map(
        shelf => ({
          type:
            shelf?.constructor?.name || "",

          title:
            getText(shelf?.title),

          contentsLength:
            shelf?.contents?.length || 0
        })
      ),

      resultCount:
        results.length,

      results
    });

  } catch (error) {

    console.error(
      "YouTube Music search test error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "YouTube Music 검색 오류",

      stack:
        error?.stack || ""
    });
  }
}


function getText(value) {

  if (!value) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value.text === "string"
  ) {
    return value.text;
  }

  try {
    return String(value);
  } catch {
    return "";
  }
}


function getArtist(item) {

  if (!item) {
    return "";
  }

  if (item.artist) {

    const value =
      getText(item.artist);

    if (value) {
      return value;
    }
  }

  if (
    Array.isArray(item.artists)
  ) {

    const artists =
      item.artists
        .map(
          artist =>
            getText(artist)
        )
        .filter(Boolean);

    if (artists.length) {
      return artists.join(", ");
    }
  }

  if (item.subtitle) {
    return getText(
      item.subtitle
    );
  }

  return "";
}


function getDuration(item) {

  if (!item) {
    return 0;
  }

  if (
    item.duration?.seconds
  ) {
    return Number(
      item.duration.seconds
    );
  }

  if (
    typeof item.duration === "number"
  ) {
    return item.duration;
  }

  return 0;
}
