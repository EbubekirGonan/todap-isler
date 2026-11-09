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
2. Havuz: Kişi aranan ve henüz sahibi olmayan işler. Satırda iki eylem: "Üstlen" (işi kendime al) ve "Ata" (bir kişi seçip ata).
3. Projeler: Büyük çaplı işler. Kartta: ad, bitiş tarihi, ilerleme çubuğu ("8 görevin 5'i bitti"), "N görevde kişi aranıyor". Projenin içinde görevleri listelenir. "Proje ekle" butonu.
4. Görevler: Tüm görevler tek liste. Varsayılan: yalnızca açık görevler, termin tarihine göre eskiden yeniye (en gecikmiş en üstte), terminsizler en altta. Amaç: bitmeyen işlerin bitmesine yönlendirmek. Filtreler: Açık/Bitenler, Proje, Kişi aranıyor.
5. Dernek: Herkese açık genel sekme. Tüm ekip ve kurulları tanıtır (ad, tür: dönemli/süresiz, dönem veya "şu tarihten beri", üyeler). Bir ekibe dokununca üyeleri ve tanıtımı açılır.

Sadece üyelere (şimdilik):
6. Ekip sekmeleri (ör. "Yönetim Kurulu", "Sosyal medya"): her ekip için ayrı sekme, sadece o ekibin üyesi görür. İçerik: dönem bilgisi (dönemliyse kalan süre çubuğu), ekibin görevleri, üyeler ve rolleri.

Diğer ekranlar:
- Görev detayı: başlık, ekip/proje, termin, durum, sorumlu ve destekçiler, açıklama, yorumlar. Eylemler: "Üstlen" / "Bırak" ve "Ata" (kişi seç).
- Görev ekleme: sadece başlık zorunlu. Opsiyonel: proje, ekip, termin. "Kişi lazım" anahtarı (true/false). "Daha fazla alan" altında gizli ayrıntılar.

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

projects(id, name, description, status, start_date, due_date, team_id NULL, created_by, created_at)

tasks(id, project_id NULL, team_id NULL, parent_task_id NULL, title, description,
      status ['todo' | 'doing' | 'done'], due_date NULL, completed_at NULL,
      needs_assignee boolean default false,
      created_by, created_at, updated_at, last_activity_at, deleted_at NULL)

task_assignments(id, task_id, user_id, role ['owner' | 'support' | 'approver'],
                 source ['assigned' | 'claimed'], assigned_by NULL, started_at, ended_at)
  - Aktif atama: ended_at IS NULL. Kişi kendisi üstlendiyse source='claimed', assigned_by boş. Başkası atadıysa source='assigned', assigned_by = atayan kullanıcı.

task_comments(id, task_id, user_id, body, created_at)
task_history(id, task_id, user_id, field, old_value, new_value, created_at)  -- denetim kaydı

Uygun indeksler ekle: tasks(status, due_date), tasks(project_id), task_assignments(user_id) WHERE ended_at IS NULL, team_members(user_id) WHERE ended_at IS NULL.

## Veri tipi ve durum kararları
- projects.status değerleri: 'active', 'done', 'archived' (varsayılan 'active').
- Gün bilgisi alanları (tasks.due_date, projects.start_date, projects.due_date, teams.term_start, teams.term_end) `date` tipindedir; saat anı değil, takvim günüdür.
- Olay zamanları (created_at, started_at, ended_at, completed_at, last_activity_at, deleted_at) `timestamptz` tipindedir.
- task_assignments: source='assigned' ise assigned_by dolu olmalı; source='claimed' ise assigned_by boş olmalı (CHECK: `(source = 'assigned') = (assigned_by IS NOT NULL)`).

## İş kuralları
- Havuz = needs_assignee = true AND status <> 'done' AND deleted_at IS NULL AND aktif 'owner' ataması yok. Havuz ayrı tablo değil, bir sorgu/görünüm.
- Üstlen: kişiye aktif 'owner' ataması oluşturur (source='claimed').
- Ata: yetkili bir kullanıcı, başka bir aktif üyeye 'owner' ataması oluşturur (source='assigned', assigned_by dolu). Atanan kişi işi İşlerim'de görür; "Bırak" diyerek işi geri verebilir.
- Bırak: ilgili atamanın ended_at alanını doldurur; needs_assignee hâlâ true ise iş kendiliğinden havuza döner.
- Atamayı kimin yapabileceği ve atanan kişinin kabulünün gerekip gerekmediği açık karar (aşağıya bak); yetki kontrolünü tek bir yerde (policy fonksiyonu) topla.
- Görevler sekmesi sıralaması: ORDER BY due_date ASC NULLS LAST, açık görevler.
- Ekip sekmesi görünürlüğü: kullanıcının aktif team_members kaydından türetilir. Dernek sekmesi tüm giriş yapmış kullanıcılara açık.
- Her görev değişikliği (durum, atama, üstlenme, bırakma, termin, kişi lazım bayrağı) task_history'ye yazılır; her harekette tasks.last_activity_at güncellenir.
- Üyelik ve atamalarda geçmiş korunur: silme yerine ended_at.

## Kararlar
1. Görünürlük: Görev eklerken "Ekibe özel" onay kutusu vardır (ekip seçiliyse aktif). İşaretliyse görev yalnızca o ekibin aktif üyelerine görünür (tasks.team_only = true, team_id zorunlu: CHECK (NOT team_only OR team_id IS NOT NULL)).
   - Havuz ve Görevler sekmelerinde varsayılan: yalnızca herkese açık görevler (team_only = false).
   - "Bana özel" filtresi: kullanıcının aktif üyesi olduğu ekiplerin ekibe özel görevlerini gösterir.
   - Ekip sekmesi: o ekibin tüm görevlerini (açık + ekibe özel) üyelere gösterir.
   - İşlerim: kullanıcıya atanmış görevler görünürlük ne olursa olsun görünür.
   - Görünürlük koşulu tek bir yerde (ortak SQL parçası/fonksiyon) tanımlanır.
2. Atama yetkisi: Herkes herkese (aktif üyelere) atayabilir. Atanan kişinin onayı gerekmez; kişi isterse "Bırak" ile işi geri verir.

## Hâlâ açık
1. Bir görev birden fazla kişi gerektirebilir mi? Şimdilik needs_assignee boolean.
2. Dönem bitince üyelikler otomatik kapanır mı, yoksa "yenile" önerisi mi çıkar?
3. Magic link için e-posta gönderim servisi (Aşama 2'de seçilecek). Geliştirme sırasında bağlantı konsola yazdırılır.
## MVP kapsamı
Dahil: users + e-posta ile şifresiz giriş (magic link), teams, team_members, projects, tasks, task_assignments (üstlenme ve atama), comments, task_history; yukarıdaki sekmeler ve ekranlar.
Şimdilik dışında (sonraya bırak, şemayı bunlara engel olmayacak şekilde tut): workflow motoru, görev bağımlılıkları, bildirimler, tekrarlayan görevler, "sürekli sorumluluklar" (responsibilities tabloları), onay akışları, zaman takibi, raporlama panoları, kanban görünümü.

## İlk adım olarak senden istediklerim
Henüz kod yazma. Önce şunları ver:
1. Önerdiğin klasör yapısı ve teknoloji seçimleri (kısa gerekçeyle).
2. İlk PostgreSQL migration dosyası (yukarıdaki modele göre, indeksler dahil).
3. API uç noktalarının listesi (hangi sekme hangi isteği yapacak).
4. Bu planda gördüğün eksik, çelişkili veya riskli noktalar.
Ben onaylayınca migration'dan başlayıp adım adım kodlayacağız.