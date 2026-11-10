# Proje: Todap iş paylaşım uygulaması (MVP)

## Rolün
Sen bu projede kıdemli bir full-stack geliştirici olarak bana eşlik ediyorsun. Önce plan öner, ben onaylayınca adım adım ilerle. Büyük işleri tek seferde yazma; her adımda ne yaptığını kısaca açıkla.

## Bağlam
Todap (todap.org) gönüllülük temelli bir dernek. Bu uygulama derneğin kendi iç kullanımı için bir iş paylaşım ve takip aracı. Hedef: işler tanımlansın, gönüllüler işleri kendileri üstlenebilsin (ortaklaşa, eşitlikçi), gerektiğinde işler kişilere atanabilsin, sorumluluklar ve süreç görünür olsun, geciken veya sahipsiz kalan işler fark edilsin.

Kullanıcıların çoğu telefondan girecek. İlk sürüm mobil öncelikli bir web uygulaması (PWA) olacak. İleride destek görürse yerel mobil uygulamaya taşınabilir; bu yüzden backend baştan API tabanlı kurulmalı.

## Tasarım ilkeleri
- Gönüllü yapı: üstlenme (claim) öncelikli, ama atama da yapılabilir. Kişi işi kendisi alabilir; yetkili biri bir işi belirli bir kişiye de atayabilir. Üstlenen veya atanan kişi yetişemezse işi bırakabilir; bırakılan iş (kişi aranıyorsa) havuza döner. Bırakmak utanılacak bir şey gibi görünmemeli.
- Basitlik: hızlı açılmalı, tek elle kullanılabilmeli, formlar kısa olmalı (yeni görev için sadece başlık zorunlu).
- Suçlayıcı olmayan dil: "yardım bekliyor", "kişi aranıyor" gibi.
- Hiçbir şey silinmez: üyelik, atama gibi ilişkilere başlangıç/bitiş tarihi konur (geçmiş korunur). Görevlerde soft delete (deleted_at).
- Tüm zamanlar timestamptz, arayüzde Europe/Istanbul.
- Arayüz metinleri Türkçe (cümle düzeni: yalnızca ilk harf büyük). Kod yorumları Türkçe. Tablo, alan ve değişken adları İngilizce.

## Teknik yığın
- Backend: Node.js (REST API). Mevcut projede kullanılan framework varsa ona uy, yoksa Express veya Fastify öner.
- Veritabanı: PostgreSQL (Neon üzerinde). Migration dosyalarıyla yönet.
- Frontend: mobile-first, hafif, PWA (manifest + service worker). Framework seçimini gerekçesiyle öner (küçük ve hızlı olmalı).
- Giriş: şifresiz, e-posta ile magic link (aşağıdaki "Giriş akışı" bölümüne bak).

## Giriş akışı (magic link)
- Sistem kapalıdır: yalnızca users tablosuna daha önce eklenmiş e-postalar giriş yapabilir; açık kayıt yok.
- Kullanıcı e-postasını girer. Sistem kısa ömürlü (ör. 15 dk), tek kullanımlık, kriptografik olarak rastgele bir token üretir. Veritabanında token'ın sadece hash'i saklanır. E-postaya bağlantı gider.
- Bağlantıya tıklanınca token doğrulanır (var mı, süresi dolmuş mu, kullanılmış mı), kullanıldı olarak işaretlenir ve oturum açılır (httpOnly, secure çerez; 30 gün hareketsizlik süresi, her etkinlikte kayar).
- Giriş bağlantısı `#token=` parçasında gider; token URL sorgusunda olmadığı için sunucu günlüklerine düşmez. Sayfa token'ı POST ile tüketir; e-posta tarayıcılarının GET ön taraması tokenı yakmaz.
- E-posta kayıtlı olsun ya da olmasın aynı nötr yanıt döner ("Kayıtlıysa bağlantı gönderdik"); böylece e-posta adresi sorgulaması engellenir. İstek sayısına sınır (rate limit) koy.
- iOS'ta ana ekrana eklenen PWA'nın oturumu Safari'den ayrı kalabildiği için, bağlantıya ek olarak 6 haneli e-posta kodu ile giriş seçeneğini de değerlendir ve öner.

## Ekranlar ve sekmeler
Üstte yatay kaydırılabilir bir sekme çubuğu var. Açılışta "İşlerim" ve "Havuz" görünür, çubuk sola çekilince diğer sekmelere geçilir. Sekmeler kişiye göre oluşur.

Herkes için:
1. İşlerim: Bana üstlendiğim veya bana atanmış aktif işler. Gruplar: Geciken / Bu hafta / Sonra. Altta "İş ekle" butonu.
2. Havuz: Katkı sağlayan kişi sayısı tahmini gerekli kişi sayısından az olan işler. Satırda iki eylem: "Katkı sağlarım" (işe katkı veren kişi olurum) ve "Destek atabilirim" (yedek olarak görünürüm). Satırda proje etiketi ve varsa üst iş de görünür. "Bana özel" filtresi küçük bir çip: aktifken renkli, pasifken gri. Aktifken yalnızca kişinin üyesi olduğu ekiplerin ekibe özel görevleri görünür; pasifken ekibe özel görevler hiç görünmez.
3. Faaliyetler (veri modelindeki projects tablosu): Büyük çaplı işler. Bir faaliyet birden fazla ekibe bağlanabilir (project_teams, bağlantılar ended_at ile kapanır). Kartta: ad, ekipler, ilerleme çubuğu ve yüzde, "N görevde kişi aranıyor". Karta dokununca faaliyetin görevleri listelenir. "Faaliyet ekle" butonu: ad zorunlu; açıklama, ekip, başlangıç ve bitiş tarihi isteğe bağlı. Faaliyet oluşturmak herkese açıktır.
4. Tüm İşler: Sahibi kim olursa olsun tüm görevler tek liste (ekibe özel olanlar dahil; başlık ve durum herkese görünür). Varsayılan olarak yalnızca açık işler gösterilir; "Açık" çipi kapatılınca tamamlananlar da listelenir. Sıralama termin tarihine göre eskiden yeniye (en gecikmiş en üstte), terminsizler en altta. "Son değişiklik" çipi açıkken son hareketi en yeni olan iş en üstte gelir. "Gecikti" çipi yalnızca tamamlanmamış ve termini bugünden (Europe/Istanbul) önce olan işleri gösterir; termini bugün olan iş gecikmiş sayılmaz. Çipler birlikte kullanılabilir.
5. Dernek: Herkese açık genel sekme. Yönetici tarafından doldurulan kutucuklardan oluşur (başlık, açıklama). Yönetici sağ altta + ile kutucuk ekler, ⋮ menüsünden düzenler. Kutucuklara kişi eklenmez. Kutucuklar eklenme sırasıyla listelenir. Ekipler bu sekmede değil, Ekipler sekmesinde listelenir.

6. Ekipler: Tüm ekiplerin listesi. Her ekipte kadro durumu ("x/y kişi · n açık yer" veya "Kadro dolu") ve o ekibin üstlendiği faaliyetler görünür. Bir kişi bir ekibe aynı anda bir kez girer; ayrıldıktan sonra tekrar katılabilir. Katılım yalnızca açık yer varsa mümkündür (gerekli kişi sayısı − aktif üye sayısı > 0). Gerekli kişi sayısı sonradan düzenlenebilir.
7. Akış: Uygulamada yapılan hareketlerin günlüğü (herkese açık). Kim ne yaptı, neyi ekledi, değiştirdi, kimi ekipten çıkardı gibi kayıtlar en yeniden eskiye listelenir; "Daha fazla" ile eski kayıtlar açılır. Ekibe özel görevlerin başlığı herkese gösterilir (bkz. Kararlar 1).

Sadece üyelere (şimdilik):
8. Ekip sekmeleri (ör. "Yönetim Kurulu", "Sosyal medya"): her ekip için ayrı sekme, sadece o ekibin üyesi görür. İçerik: dönem bilgisi (dönemliyse kalan süre çubuğu), ekibin görevleri, üyeler ve rolleri.

Diğer ekranlar:
- Kart: son tarih ("Son tarih: gg.aa.yyyy") varsa görünür; katkı sayısı "sahiplenen/tahmin" biçimindedir. Ara hedef tarihi şimdilik ekranlarda gösterilmez.
- Görev detayı: önce salt okunur görünüm açılır. Başlık, ekip/proje, üst iş, son tarih, durum (planlama aşamasında / işlemde / bitmek üzere / bitti), tahmini gerekli kişi sayısı, "Katkı Sağlarım: sahiplenen/tahmin" ve destekçiler, açıklama, yorumlar. Eylemler: "Katkı sağlarım", "Destek atabilirim" (her ikisi onay ister) ve "İşlemler" menüsü (Düzenle, Başkasına ata, Bırakmak durumundayım; bırakma onay ister). Menü dış tıklama ve Escape ile kapanır.
- Düzenle: İşlemler menüsünden aynı ekranda form açar (durum, başlık, açıklama, tahmini kişi sayısı, son tarih); ayrı pencere açılmaz. Kaydet, "Değişiklikleri kaydetmek istediğinize emin misiniz?" onayından sonra kaydeder ve görünüm moduna döner. Vazgeçilirse düzenleme açık kalır, hiçbir şey kaydedilmez.
- Görev ekleme: sadece başlık zorunlu. Opsiyonel: proje, ekip, termin, "Tahmini Gerekli Kişi Sayısı" (boş bırakılırsa 1).

## Veri modeli (başlangıç)
users(id, name, email, phone, active, created_at)

login_tokens(id, user_id, token_hash, code_hash, attempts default 0, expires_at, used_at NULL, created_at)
  - Bağlantı token'ı ve 6 haneli kod aynı satırda tutulur; ikisi de HMAC-SHA256 (SESSION_SECRET) ile hash'lenir. code_hash zorunludur.
  - attempts: yanlış kod sayacı; 5'e ulaşınca kod artık denenmez.

sessions(id, user_id, token_hash, created_at, last_seen_at, revoked_at NULL)
  - Oturum çerezi (todap_session) opak bir token'dır; sadece hash'i saklanır. Hareketsizlik süresi 30 gün ve kaydırmalıdır.

teams(id, name, description, type ['term' | 'ongoing'], term_start, term_end, created_at)
  - 'term' = dönemli (ör. Yönetim Kurulu, 2 yıl); 'ongoing' = süresiz (ör. Sosyal medya ekibi); ongoing'de term_end boş.

team_members(id, team_id, user_id, role_title, started_at, ended_at)
  - ended_at boşsa kişi hâlâ üye. Silme yok.

projects(id, name, description, status, start_date, due_date, created_by, created_at)

project_teams(id, project_id, team_id, started_at, ended_at NULL)
association_tiles(id, title, description NULL, created_by, created_at, updated_at, deleted_at NULL)
association_tile_members(id, tile_id, user_id, started_at, ended_at NULL) -- kullanılmıyor; kişi ekleme kaldırıldı, tablo ileride silinebilir
  - Bir faaliyet birden fazla ekibe, bir ekip birden fazla faaliyete bağlanabilir. ended_at boşsa bağlantı açıktır.

tasks(id, project_id NULL, team_id NULL, parent_task_id NULL, title, description,
      status ['planning' | 'in_progress' | 'nearly_done' | 'done'] default 'planning', due_date NULL, target_date NULL, completed_at NULL,
      estimated_people integer default 1 (1..50),
      created_by, created_at, updated_at, last_activity_at, deleted_at NULL)

task_assignments(id, task_id, user_id, role ['owner' | 'support' | 'approver'],
                 source ['assigned' | 'claimed'], assigned_by NULL, started_at, ended_at)
  - Aktif atama: ended_at IS NULL. Kişi kendisi üstlendiyse source='claimed', assigned_by boş. Başkası atadıysa source='assigned', assigned_by = atayan kullanıcı.

task_comments(id, task_id, user_id, body, created_at)
task_history(id, task_id, user_id, field, old_value, new_value, created_at)  -- denetim kaydı

Uygun indeksler ekle: tasks(status, due_date), tasks(project_id), task_assignments(user_id) WHERE ended_at IS NULL, team_members(user_id) WHERE ended_at IS NULL.

## Veri tipi ve durum kararları
- projects.status değerleri: 'active', 'done', 'archived' (varsayılan 'active').
- tasks.target_date (ara hedef tarihi): migration `1794300000000_task-target-date` ile eklendi. API'de kabul edilir ve döner, ancak arayüzde şimdilik gösterilmez. Kolon kaldırılmaz.
- Gün bilgisi alanları (tasks.due_date, tasks.target_date, projects.start_date, projects.due_date, teams.term_start, teams.term_end) `date` tipindedir; saat anı değil, takvim günüdür.
- Olay zamanları (created_at, started_at, ended_at, completed_at, last_activity_at, deleted_at) `timestamptz` tipindedir.
- task_assignments: source='assigned' ise assigned_by dolu olmalı; source='claimed' ise assigned_by boş olmalı (CHECK: `(source = 'assigned') = (assigned_by IS NOT NULL)`).

## İş kuralları
- Havuz = status <> 'done' AND deleted_at IS NULL AND team_only = false AND aktif 'owner' sayısı < estimated_people. Havuz ayrı tablo değil, bir sorgu/görünüm.
- Kapasite: aktif 'owner' sayısı estimated_people'ı geçemez. 'support' kayıtları kapasiteye sayılmaz ve sınırsızdır. Tahmini kişi sayısı mevcut 'owner' sayısının altına düşürülemez (409).
- Katkı sağlarım: kişiye aktif 'owner' ataması oluşturur (source='claimed'). Kapasite doluysa 409 döner; aynı kişi ikinci kez katkı sağlayamaz.
- Ata: aktif bir kullanıcı, başka bir aktif kullanıcıya 'owner' ataması oluşturur (source='assigned', assigned_by dolu). Mevcut katkı sağlayanlar kalır; kapasite doluysa 409 döner. Ekibe özel görevlerde hedef kişi o ekibin aktif üyesi olmalıdır. Atanan kişi işi İşlerim'de görür; "Bırakmak durumundayım" diyerek işi geri verebilir.
- Destek atabilirim: aktif bir kullanıcı görevde 'support' kaydı oluşturabilir (source='claimed'). Katkı sağlarım ile destek kaydı kapanır.
- Bırakmak durumundayım: ilgili atamanın ended_at alanını doldurur; kapasite yeniden açılırsa iş kendiliğinden havuza döner.
- Atama ve düzenleme yetkisi kararları aşağıdadır. Görünürlük kuralları tek modülde (server/src/policy/visibility.ts) toplanır; rotalar bu kuralları kendisi yeniden yazmaz.
- Tüm İşler sekmesi sıralaması: ORDER BY due_date ASC NULLS LAST, varsayılan olarak açık görevler. "Son değişiklik" (sort=changed) ORDER BY last_activity_at DESC. "Gecikti" (overdue=true) due_date < bugün ve status <> 'done'.
- Ekip sekmesi görünürlüğü: kullanıcının aktif team_members kaydından türetilir. Dernek sekmesi tüm giriş yapmış kullanıcılara açık.
- Her görev değişikliği (durum, atama, üstlenme, bırakma, termin, kişi lazım bayrağı) task_history'ye yazılır; her harekette tasks.last_activity_at güncellenir.
- Üyelik ve atamalarda geçmiş korunur: silme yerine ended_at.

## Kararlar
1. Görünürlük: Görev eklerken "Ekibe özel" onay kutusu vardır (ekip seçiliyse aktif). İşaretliyse görev yalnızca o ekibin aktif üyelerine görünür (tasks.team_only = true, team_id zorunlu: CHECK (NOT team_only OR team_id IS NOT NULL)).
   - Ekibe özel bir görevin başlığı, durumu ve detayı herkese görünür (Tüm İşler, Faaliyetler, detay). Yalnızca o ekibin aktif üyeleri katkı sağlayabilir ya da destek olabilir; üye olmayanlarda "Katkı sağlarım" ve "Destek atabilirim" butonları gizlenir (sunucuda da 409 döner).
   - Havuz varsayılan olarak yalnızca herkese açık görevleri gösterir (team_only = false). Ekibe özel görevler yalnızca "Bana özel" filtresi açıkken ve yalnızca kişinin aktif üyesi olduğu ekiplerin görevleri olarak görünür (scope=mine-team).
   - "Bana özel" filtresi: kullanıcının aktif üyesi olduğu ekiplerin ekibe özel görevlerini gösterir.
   - Ekip sekmesi: o ekibin tüm görevlerini (açık + ekibe özel) üyelere gösterir.
   - İşlerim: kullanıcıya atanmış görevler görünürlük ne olursa olsun görünür.
   - Görünürlük kuralı tek bir modülde (server/src/policy/visibility.ts) tanımlanır; route'lara dağıtılmaz.
2. Atama yetkisi: Herkes herkese (aktif üyelere) atayabilir. Atanan kişinin onayı gerekmez; kişi isterse "Bırak" ile işi geri verir. Ekibe özel görevlerde yalnızca o ekibin aktif üyeleri atanabilir; ekibe özel yapılan görevde ekip dışı atanmış kişi varsa değişiklik reddedilir (409).
3. Düzenleme ve silme: Aktif her kullanıcı görevi düzenleyebilir ve yumuşak silebilir.
4. İlerleme sayıları (Faaliyetler): Ekibe özel görevler de sayılır (kullanıcı kararı; başlığı herkese görünen görevlerin sayısına dahil edilir).
5. Destek rolü Aşama 3'te dahildir: 'support' kaydı, katkı sağlama ve bırakma ile aynı kurallarla çalışır, ama kapasiteye sayılmaz.

## Hâlâ açık
1. Dönem bitince üyelikler otomatik kapanır mı, yoksa "yenile" önerisi mi çıkar?
2. Magic link için e-posta gönderim servisi (Aşama 2'de seçilecek). Geliştirme sırasında bağlantı konsola yazdırılır.
## MVP kapsamı
Dahil: users + e-posta ile şifresiz giriş (magic link), teams, team_members, projects, tasks, task_assignments (üstlenme ve atama), comments, task_history; yukarıdaki sekmeler ve ekranlar.
Ekip mesajları (team_messages): Her ekip sayfasında ekip içi ortak sohbet (ortak WhatsApp grubu gibi). Kurallar:
- Yalnızca o ekibin aktif üyeleri okuyabilir ve yazabilir. Yönetici (admin) her ekibin mesajlarını okuyabilir.
- Mesajlar Akış'a, Dernek'e veya başka bir yere yansımaz.
- Mesaj yazan kişi kendi mesajını düzenleyebilir ve silebilir (yumuşak silme, deleted_at). Düzenlenen mesaj "düzenlendi" olarak işaretlenir.
- Yenileme: Sayfa açıkken 30 sn'de bir otomatik yenileme yapılmaz. Sayfada yenile düğmesi bulunur; sekme tekrar öne geldiğinde de liste yenilenir.
- Yetki kuralı tek bir modülde (policy/visibility) toplanır.
Şimdilik dışında (sonraya bırak, şemayı bunlara engel olmayacak şekilde tut): workflow motoru, görev bağımlılıkları, bildirimler, tekrarlayan görevler, "sürekli sorumluluklar" (responsibilities tabloları), onay akışları, zaman takibi, raporlama panoları, kanban görünümü.

## İlk adım olarak senden istediklerim
Henüz kod yazma. Önce şunları ver:
1. Önerdiğin klasör yapısı ve teknoloji seçimleri (kısa gerekçeyle).
2. İlk PostgreSQL migration dosyası (yukarıdaki modele göre, indeksler dahil).
3. API uç noktalarının listesi (hangi sekme hangi isteği yapacak).
4. Bu planda gördüğün eksik, çelişkili veya riskli noktalar.
Ben onaylayınca migration'dan başlayıp adım adım kodlayacağız.