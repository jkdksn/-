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
            getNodeText(item?.title),

          artist:
            getArtist(item),

          artists:
            getArtists(item),

          album:
            getNodeText(item?.album),

          duration:
            getDuration(item),

          debug: {
            artist: inspectNode(item?.artist),

            artists:
              Array.isArray(item?.artists)
                ? item.artists.map(
                    artist =>
                      inspectNode(artist)
                  )
                : [],

            album:
              inspectNode(item?.album),

            flexColumns:
              Array.isArray(
                item?.flex_columns
              )
                ? item.flex_columns.map(
                    column =>
                      inspectNode(column)
                  )
                : []
          }
        });
      }
    }

    return res.status(200).json({
      success: true,

      query,

      shelfCount:
        shelves.length,

      shelves:
        shelves.map(
          shelf => ({
            type:
              shelf?.constructor?.name || "",

            title:
              getNodeText(shelf?.title),

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


/*
  YouTube.js의 Text / YTNode 객체에서
  실제 글자를 최대한 안전하게 가져온다.
*/
function getNodeText(value) {

  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  if (typeof value.simpleText === "string") {
    return value.simpleText;
  }

  if (Array.isArray(value.runs)) {
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
    YouTube.js의 일부 Text 객체는
    toString()을 통해 실제 텍스트를 반환한다.
  */
  try {
    const text =
      value.toString();

    if (
      text &&
      text !== "[object Object]"
    ) {
      return text;
    }
  } catch {}

  return "";
}


/*
  artist / artists를 최대한 정확하게 추출한다.
*/
function getArtist(item) {

  if (!item) {
    return "";
  }

  if (item.artist) {
    const artist =
      getNodeText(item.artist);

    if (artist) {
      return artist;
    }
  }

  if (
    Array.isArray(item.artists)
  ) {
    const artists =
      item.artists
        .map(
          artist =>
            getNodeText(artist)
        )
        .filter(Boolean);

    if (artists.length) {
      return artists.join(", ");
    }
  }

  /*
    MusicResponsiveListItem의
    flex_columns 구조도 확인한다.
  */
  if (
    Array.isArray(
      item.flex_columns
    )
  ) {
    const values =
      item.flex_columns
        .map(
          column =>
            getNodeText(column)
        )
        .filter(Boolean);

    /*
      첫 번째 컬럼은 제목인 경우가 많으므로
      제목과 다른 값을 아티스트 후보로 사용한다.
    */
    for (const value of values) {
      if (
        value &&
        normalize(value) !==
          normalize(
            getNodeText(item.title)
          )
      ) {
        return value;
      }
    }
  }

  return "";
}


function getArtists(item) {

  if (
    !item ||
    !Array.isArray(item.artists)
  ) {
    return [];
  }

  return item.artists
    .map(
      artist =>
        getNodeText(artist)
    )
    .filter(Boolean);
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


/*
  디버깅용:
  실제 내부 객체에 어떤 속성이 있는지 확인한다.
*/
function inspectNode(value) {

  if (!value) {
    return null;
  }

  const result = {
    constructor:
      value?.constructor?.name || "",

    keys: []
  };

  try {
    result.keys =
      Object.keys(value);
  } catch {}

  /*
    실제 텍스트 후보도 같이 보여준다.
  */
  result.text =
    typeof value.text === "string"
      ? value.text
      : "";

  result.simpleText =
    typeof value.simpleText === "string"
      ? value.simpleText
      : "";

  if (Array.isArray(value.runs)) {
    result.runs =
      value.runs.map(
        run => ({
          constructor:
            run?.constructor?.name || "",

          text:
            typeof run === "string"
              ? run
              : run?.text || "",

          keys:
            run &&
            typeof run === "object"
              ? Object.keys(run)
              : []
        })
      );
  }

  return result;
}


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
