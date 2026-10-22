using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TrainFlow.ExerciseCatalog.Infrastructure.Migrations;

[DbContext(typeof(ExerciseCatalogDbContext))]
[Migration("20261018160000_ImportBodyParts3DMuscles")]
public sealed class ImportBodyParts3DMuscles : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql(SeedSql);

    // Imported catalogue entries can acquire exercise links; rollback must never delete them.
    protected override void Down(MigrationBuilder migrationBuilder) { }

    public const string SeedSql = """
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37451','abductor digiti minimi of foot','abductor digiti minimi of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37382','abductor digiti minimi of hand','abductor digiti minimi of hand',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37373','abductor pollicis brevis','abductor pollicis brevis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38515','abductor pollicis longus','abductor pollicis longus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma43885','adductor minimus','adductor minimus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37704','anconeus','anconeus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46602','aryepiglotticus','aryepiglotticus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma23082','cervical rotator','cervical rotator',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma19088','coccygeus','coccygeus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37664','coracobrachialis','coracobrachialis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46291','digastric','digastric',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38503','extensor digiti minimi','extensor digiti minimi',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38500','extensor digitorum','extensor digitorum',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma51141','extensor hallucis brevis','extensor hallucis brevis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38524','extensor indicis','extensor indicis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38518','extensor pollicis brevis','extensor pollicis brevis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38521','extensor pollicis longus','extensor pollicis longus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma21930','External anal sphincter','External anal sphincter',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma9756','External intercostal muscle','External intercostal muscle',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37479','first lumbrical of foot','first lumbrical of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37738','first plantar interosseous of foot','first plantar interosseous of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37452','flexor accessorius','flexor accessorius',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37455','flexor digiti minimi brevis of foot','flexor digiti minimi brevis of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37383','flexor digiti minimi brevis of hand','flexor digiti minimi brevis of hand',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38478','flexor digitorum profundus','flexor digitorum profundus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38469','flexor digitorum superficialis','flexor digitorum superficialis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37378','flexor pollicis brevis','flexor pollicis brevis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38481','flexor pollicis longus','flexor pollicis longus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37482','fourth lumbrical of foot','fourth lumbrical of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46690','genioglossus','genioglossus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46325','geniohyoid','geniohyoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46691','hyoglossus','hyoglossus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma19092','iliococcygeus','iliococcygeus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22704','iliocostalis cervicis','iliocostalis cervicis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22702','iliocostalis lumborum','iliocostalis lumborum',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22703','iliocostalis thoracis','iliocostalis thoracis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma49040','inferior oblique','inferior oblique',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46623','inferior pharyngeal constrictor','inferior pharyngeal constrictor',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma49036','inferior rectus','inferior rectus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma9758','Innermost intercostal muscle','Innermost intercostal muscle',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma9757','Internal intercostal muscle','Internal intercostal muscle',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22846','interspinalis thoracis','interspinalis thoracis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46579','lateral crico-arytenoid','lateral crico-arytenoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22850','Lateral lumbar intertransversarius','Lateral lumbar intertransversarius',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma49038','lateral rectus','lateral rectus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma49041','levator palpebrae superioris','levator palpebrae superioris',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46727','levator veli palatini','levator veli palatini',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22714','longissimus capitis','longissimus capitis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22711','longissimus cervicis','longissimus cervicis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22709','longissimus thoracis','longissimus thoracis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46308','longus capitis','longus capitis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma23084','lumbar rotator','lumbar rotator',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22851','Medial lumbar intertransversarius','Medial lumbar intertransversarius',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma49037','medial rectus','medial rectus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46622','middle pharyngeal constrictor','middle pharyngeal constrictor',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46320','mylohyoid','mylohyoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46583','oblique arytenoid','oblique arytenoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13342','omohyoid','omohyoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma86033','opponens digiti minimi of foot','opponens digiti minimi of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37384','opponens digiti minimi of hand','opponens digiti minimi of hand',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37379','opponens pollicis','opponens pollicis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46666','palatopharyngeus','palatopharyngeus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma38462','palmaris longus','palmaris longus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13109','pectoralis minor','pectoralis minor',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22543','plantaris','plantaris',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma45738','platysma','platysma',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22590','popliteus','popliteus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46576','posterior crico-arytenoid','posterior crico-arytenoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma19090','pubococcygeus','pubococcygeus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma19091','puborectalis','puborectalis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46312','rectus capitis anterior','rectus capitis anterior',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46316','rectus capitis lateralis','rectus capitis lateralis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46665','salpingopharyngeus','salpingopharyngeus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22353','sartorius','sartorius',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37480','second lumbrical of foot','second lumbrical of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37739','second plantar interosseous of foot','second plantar interosseous of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22829','semispinalis cervicis','semispinalis cervicis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22828','semispinalis thoracis','semispinalis thoracis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13402','serratus posterior inferior','serratus posterior inferior',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13401','serratus posterior superior','serratus posterior superior',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma22765','spinalis thoracis','spinalis thoracis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13341','sternohyoid','sternohyoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13343','sternothyroid','sternothyroid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma9625','stylohyoid','stylohyoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46664','stylopharyngeus','stylopharyngeus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13410','subclavius','subclavius',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma49039','superior oblique','superior oblique',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46621','superior pharyngeal constrictor','superior pharyngeal constrictor',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma49035','superior rectus','superior rectus',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46730','tensor veli palatini','tensor veli palatini',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37481','third lumbrical of foot','third lumbrical of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma37740','third plantar interosseous of foot','third plantar interosseous of foot',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma23083','Thoracic rotator','Thoracic rotator',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46588','thyro-arytenoid','thyro-arytenoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma13344','thyrohyoid','thyrohyoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46582','Transverse arytenoid','Transverse arytenoid',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma9760','transversus thoracis','transversus thoracis',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46733','Uvular muscle','Uvular muscle',true,1) ON CONFLICT (key) DO NOTHING;
    INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES ('anatomy-fma46591','vocalis','vocalis',true,1) ON CONFLICT (key) DO NOTHING;
    """;
}
