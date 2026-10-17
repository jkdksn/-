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
            getTitle(item),

          artist:
            getArtist(item),

          artists:
            getArtists(item),

          album:
            getAlbum(item),

          duration:
            getDuration(item),

          debug: {
            artist:
              inspectArtist(item),

            album:
              inspectAlbum(item)
          }
        });
      }
    }

    /*
      제목이 검색어와 정확히 일치하는 후보만
      YouTube Music getInfo()로 추가 확인한다.

      예:
      RESCENE BLOOM 검색 결과에서
      제목이 Bloom인 곡들만 확인.
    */
    const exactCandidates =
      results.filter(
        item =>
          normalize(item.title) ===
          normalize(
            getLastSearchWord(query)
          )
      );

    const verifiedCandidates = [];

    for (
      const candidate of exactCandidates
    ) {
      try {
        const info =
          await youtube.music.getInfo(
            candidate.id
          );

        const basic =
          info?.basic_info || {};

        verifiedCandidates.push({
          id:
            candidate.id,

          searchTitle:
            candidate.title,

          searchArtist:
            candidate.artist,

          searchArtists:
            candidate.artists,

          searchAlbum:
            candidate.album,

          searchDuration:
            candidate.duration,

          infoTitle:
            basic.title || "",

          infoAuthor:
            basic.author || "",

          infoDuration:
            basic.duration || 0,

          infoChannelId:
            basic.channel_id || ""
        });

      } catch (error) {

        verifiedCandidates.push({
          id:
            candidate.id,

          searchTitle:
            candidate.title,

          searchArtist:
            candidate.artist,

          searchArtists:
            candidate.artists,

          searchAlbum:
            candidate.album,

          searchDuration:
            candidate.duration,

          infoTitle:
            "",

          infoAuthor:
            "",

          infoDuration:
            0,

          infoChannelId:
            "",

          infoError:
            error?.message || ""
        });
      }
    }

    return res.status(200).json({
      success: true,

      query,

      shelfCount:
        shelves.length,

      resultCount:
        results.length,

      results,

      exactCandidateCount:
        exactCandidates.length,

      verifiedCandidates
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


/* =========================
   제목
========================= */

function getTitle(item) {

  if (!item) {
    return "";
  }

  return getText(
    item.title
  );
}


/* =========================
   아티스트
========================= */

function getArtist(item) {

  if (!item) {
    return "";
  }

  /*
    가장 직접적인 artist
  */
  if (item.artist) {
    const artist =
      getText(
        item.artist
      );

    if (artist) {
      return artist;
    }
  }

  /*
    artists 배열
  */
  if (
    Array.isArray(
      item.artists
    )
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

  return "";
}


function getArtists(item) {

  if (
    !item ||
    !Array.isArray(
      item.artists
    )
  ) {
    return [];
  }

  return item.artists
    .map(
      artist =>
        getText(artist)
    )
    .filter(Boolean);
}


/* =========================
   앨범
========================= */

function getAlbum(item) {

  if (!item?.album) {
    return "";
  }

  return getText(
    item.album
  );
}


/* =========================
   Text / Name 추출
========================= */

function getText(value) {

  if (!value) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  /*
    artist 객체:
    {
      name,
      channel_id,
      endpoint
    }
  */

  if (
    typeof value.name === "string"
  ) {
    return value.name;
  }

  /*
    album 객체도 name을 사용한다.
  */

  if (
    typeof value.text === "string"
  ) {
    return value.text;
  }

  if (
    typeof value.simpleText === "string"
  ) {
    return value.simpleText;
  }

  /*
    runs 구조
  */

  if (
    Array.isArray(
      value.runs
    )
  ) {
    const text =
      value.runs
        .map(
          run =>
            typeof run === "string"
              ? run
              : run?.text || ""
        )
        .join("");

    if (text) {
      return text;
    }
  }

  /*
    마지막 fallback
  */

  try {

    const text =
      value.toString();

    if (
      text &&
      text !==
        "[object Object]"
    ) {
      return text;
    }

  } catch {}

  return "";
}


/* =========================
   재생시간
========================= */

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
    typeof item.duration ===
    "number"
  ) {
    return item.duration;
  }

  return 0;
}


/* =========================
   디버깅
========================= */

function inspectArtist(item) {

  if (!item) {
    return null;
  }

  if (
    Array.isArray(
      item.artists
    )
  ) {
    return item.artists.map(
      artist => ({
        constructor:
          artist?.constructor?.name ||
          "",

        name:
          typeof artist?.name ===
          "string"
            ? artist.name
            : "",

        channel_id:
          artist?.channel_id || "",

        keys:
          Object.keys(
            artist || {}
          )
      })
    );
  }

  return null;
}


function inspectAlbum(item) {

  if (!item?.album) {
    return null;
  }

  return {
    constructor:
      item.album?.constructor
        ?.name || "",

    name:
      typeof item.album?.name ===
      "string"
        ? item.album.name
        : "",

    id:
      item.album?.id || "",

    keys:
      Object.keys(
        item.album || {}
      )
  };
}


/* =========================
   검색어 마지막 단어
========================= */

function getLastSearchWord(
  query
) {

  const words =
    String(query || "")
      .trim()
      .split(/\s+/);

  return (
    words[words.length - 1] ||
    ""
  );
}


/* =========================
   비교용 정규화
========================= */

function normalize(value) {

  return String(
    value || ""
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      ""
    )
    .trim();
}
