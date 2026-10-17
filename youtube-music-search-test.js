import { Innertube } from "youtubei.js";

export default async function handler(req, res) {
  try {
    const query =
      req.query?.q || "";

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "검색어가 없습니다.",
        example:
          "/api/youtube-music-search-test?q=RESCENE%20BLOOM"
      });
    }

    const youtube =
      await Innertube.create({
        lang: "ko",
        location: "KR"
      });

    const search =
      await youtube.music.search(
        query,
        {
          type: "song"
        }
      );

    /*
      검색 결과의 실제 구조를 확인하기 위한
      디버그 정보
    */

    const songs =
      search?.songs;

    const contents =
      songs?.contents || [];

    const results = [];

    for (
      const item of contents
    ) {
      results.push({
        constructor:
          item?.constructor?.name || "",

        id:
          item?.id || "",

        title:
          safeString(
            item?.title
          ),

        artist:
          safeString(
            item?.artist
          ),

        artists:
          Array.isArray(
            item?.artists
          )
            ? item.artists.map(
                (artist) =>
                  safeString(
                    artist
                  )
              )
            : [],

        album:
          safeString(
            item?.album
          ),

        duration:
          safeDuration(
            item?.duration
          ),

        subtitle:
          safeString(
            item?.subtitle
          )
      });
    }

    /*
      search 객체에서 실제로 어떤 키가
      존재하는지도 확인
    */

    return res.status(200).json({
      success: true,

      query,

      searchKeys:
        Object.keys(
          search || {}
        ),

      songsExists:
        !!songs,

      songsKeys:
        songs
          ? Object.keys(songs)
          : [],

      contentsExists:
        !!songs?.contents,

      contentsType:
        songs?.contents
          ? songs.contents
              .constructor?.name
          : "",

      contentsLength:
        songs?.contents?.length ??
        0,

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


function safeString(value) {

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


function safeDuration(value) {

  if (!value) {
    return 0;
  }

  if (
    typeof value === "number"
  ) {
    return value;
  }

  if (
    typeof value.seconds === "number"
  ) {
    return value.seconds;
  }

  return 0;
}
