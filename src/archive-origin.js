// A small provenance label replaces full old quotations in model context.
export function archiveOrigin(record){const note=record.source?.note||'';if(/自主发展|发展候选/.test(note))return '玩家确认的自主发展候选';if(/草案/.test(note))return '玩家采用的设定草案，未证明正文执行';if(/世界书|设定底稿/.test(note)||record.specific?.fields.source_profile)return '世界书设定底稿';if(record.source?.type==='story')return '已核对剧情';return '玩家记录或补充';}
