import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAAEI9nMEMfUwbGbPHTyGRJ2dAfBRW7_Fo",
    authDomain: "hoctaptructuyen-7c09a.firebaseapp.com",
    projectId: "hoctaptructuyen-7c09a",
    storageBucket: "hoctaptructuyen-7c09a.firebasestorage.app",
    messagingSenderId: "329551572068",
    appId: "1:329551572068:web:41b7b3174ef45a77008371",
    measurementId: "G-F0DTTKEBHC"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const dbRT = getDatabase(app);

// === MOCK DATA: BỘ ĐỀ MẪU ===
// Bạn có thể dễ dàng thêm hoặc thay đổi câu hỏi tại đây
const mockQuizzes = [
    {
        id: "english_review_gk2_11",
        title: "Review GK2 - 11",
        description: "Đề ôn tập giữa kỳ 2 môn Tiếng Anh lớp 11 (Phonetics, Stress, Vocabulary & Grammar).",
        questions: [
            // PHONETICS
            { id: "q1", section: "PHONETICS", text: "", options: ["A. <u>h</u>eritage", "B. <u>h</u>istoric", "C. <u>h</u>onor", "D. <u>h</u>abitat"], correctIndex: 2 },
            { id: "q2", section: "PHONETICS", text: "", options: ["A. acad<u>e</u>mic", "B. pr<u>e</u>serve", "C. r<u>e</u>lic", "D. s<u>e</u>tting"], correctIndex: 1 },
            { id: "q3", section: "PHONETICS", text: "", options: ["A. d<u>e</u>gree", "B. appr<u>e</u>ntice", "C. coll<u>e</u>ge", "D. univ<u>e</u>rsity"], correctIndex: 1 },
            { id: "q4", section: "PHONETICS", text: "", options: ["A. <u>ch</u>oice", "B. <u>ch</u>ance", "C. <u>ch</u>aracter", "D. <u>ch</u>air"], correctIndex: 2 },
            { id: "q5", section: "PHONETICS", text: "", options: ["A. d<u>e</u>cide", "B. d<u>e</u>pend", "C. d<u>e</u>velop", "D. d<u>e</u>dicated"], correctIndex: 3 },
            { id: "q6", section: "PHONETICS", text: "", options: ["A. r<u>i</u>se", "B. sk<u>i</u>ll", "C. t<u>i</u>me", "D. l<u>i</u>fe"], correctIndex: 1 },
            { id: "q7", section: "PHONETICS", text: "", options: ["A. <u>a</u>ncient", "B. l<u>a</u>ndscape", "C. v<u>a</u>lley", "D. st<u>a</u>te"], correctIndex: 2 },
            { id: "q8", section: "PHONETICS", text: "", options: ["A. me<u>ch</u>anic", "B. <u>ch</u>oice", "C. <u>ch</u>ance", "D. <u>ch</u>ange"], correctIndex: 0 },

            // STRESS
            { id: "q9", section: "STRESS", text: "", options: ["A. routine", "B. laundry", "C. household", "D. budget"], correctIndex: 0 },
            { id: "q10", section: "STRESS", text: "", options: ["A. independent", "B. irresponsible", "C. intermediate", "D. individual"], correctIndex: 1 },
            { id: "q11", section: "STRESS", text: "", options: ["A. manage", "B. master", "C. polite", "D. student"], correctIndex: 2 },
            { id: "q12", section: "STRESS", text: "", options: ["A. academic", "B. vocational", "C. professional", "D. responsible"], correctIndex: 0 },
            { id: "q13", section: "STRESS", text: "", options: ["A. temple", "B. relic", "C. complex", "D. suggest"], correctIndex: 3 },
            { id: "q14", section: "STRESS", text: "", options: ["A. recognize", "B. monument", "C. recommend", "D. landscape"], correctIndex: 2 },

            // VOCABULARY AND GRAMMAR
            { id: "q15", section: "VOCABULARY AND GRAMMAR", text: "The Citadel of the Ho Dynasty was ______ as a World Heritage Site in 2011.", options: ["A. recognized", "B. performed", "C. restored", "D. protected"], correctIndex: 0 },
            { id: "q16", section: "VOCABULARY AND GRAMMAR", text: "It is important to ______ our traditional music so that future generations can enjoy it.", options: ["A. damage", "B. preserve", "C. ignore", "D. replace"], correctIndex: 1 },
            { id: "q17", section: "VOCABULARY AND GRAMMAR", text: "______ the ancient temple, we were amazed by the intricate carvings.", options: ["A. Visit", "B. Visiting", "C. Visited", "D. To visiting"], correctIndex: 1 },
            { id: "q18", section: "VOCABULARY AND GRAMMAR", text: "The ______ of the old palace took several years and cost millions of dollars.", options: ["A. restore", "B. restorative", "C. restoration", "D. restorer"], correctIndex: 2 },
            { id: "q19", section: "VOCABULARY AND GRAMMAR", text: "Participating in the folk-singing club helps students contribute ______ the preservation of local culture.", options: ["A. in", "B. on", "C. to", "D. for"], correctIndex: 2 },
            { id: "q20", section: "VOCABULARY AND GRAMMAR", text: "It was my mother ______ taught me how to cook when I was a child.", options: ["A. which", "B. whom", "C. that", "D. whose"], correctIndex: 2 },
            { id: "q21", section: "VOCABULARY AND GRAMMAR", text: "______ in his financial report, he went to bed.", options: ["A. Having handed", "B. Handing", "C. To handing", "D. To hand"], correctIndex: 0 },
            { id: "q22", section: "VOCABULARY AND GRAMMAR", text: "Scientists are trying to come up ______ new ways to reduce plastic waste in the oceans.", options: ["A. with", "B. on", "C. in", "D. by"], correctIndex: 0 },
            { id: "q23", section: "VOCABULARY AND GRAMMAR", text: "Many school-leavers choose ______ education to learn practical skills for a specific job.", options: ["A. academic", "B. vocational", "C. secondary", "D. primary"], correctIndex: 1 },
            { id: "q24", section: "VOCABULARY AND GRAMMAR", text: "After finishing high school, you can apply for an ______ to work and learn at the same time.", options: ["A. internship", "B. appointment", "C. application", "D. apprenticeship"], correctIndex: 3 },
            { id: "q25", section: "VOCABULARY AND GRAMMAR", text: "______ hard for the entrance exam, she felt confident about her results.", options: ["A. Study", "B. Studying", "C. Studied", "D. To study"], correctIndex: 1 },
            { id: "q26", section: "VOCABULARY AND GRAMMAR", text: "Higher education provides students with specialized ______ in various fields.", options: ["A. know", "B. knowledgeable", "C. knowledge", "D. known"], correctIndex: 2 },
            { id: "q27", section: "VOCABULARY AND GRAMMAR", text: "Students often depend ______ their parents for financial support during their university years.", options: ["A. on", "B. in", "C. with", "D. at"], correctIndex: 0 },
            { id: "q28", section: "VOCABULARY AND GRAMMAR", text: "It was the vintage car ______ my father bought at the auction last Sunday.", options: ["A. whose", "B. whom", "C. who", "D. that"], correctIndex: 3 },
            { id: "q29", section: "VOCABULARY AND GRAMMAR", text: "______ for a gap year, he gained a lot of life experience before starting college.", options: ["A. Having opted", "B. To opting", "C. Opts", "D. To opt"], correctIndex: 0 },
            { id: "q30", section: "VOCABULARY AND GRAMMAR", text: "To protect the environment, we should get ______ the habit of recycling our household waste every day.", options: ["A. into", "B. in", "C. on", "D. by"], correctIndex: 0 },
            { id: "q31", section: "VOCABULARY AND GRAMMAR", text: "Learning how to ______ a budget is an essential life skill for teenagers.", options: ["A. make", "B. do", "C. manage", "D. carry"], correctIndex: 2 },
            { id: "q32", section: "VOCABULARY AND GRAMMAR", text: "Teenagers should learn to be ______ so they don't have to rely on their parents for everything.", options: ["A. dependent", "B. self-reliant", "C. helpful", "D. curious"], correctIndex: 1 },
            { id: "q33", section: "VOCABULARY AND GRAMMAR", text: "______ how to cook, Nam can now prepare healthy meals for himself.", options: ["A. Learn", "B. Learning", "C. Learned", "D. To learn"], correctIndex: 1 },
            { id: "q34", section: "VOCABULARY AND GRAMMAR", text: "Developing time-management skills is key to your ______.", options: ["A. independent", "B. independence", "C. independently", "D. independed"], correctIndex: 1 },
            { id: "q35", section: "VOCABULARY AND GRAMMAR", text: "Parents should encourage their children to take responsibility ______ their own actions.", options: ["A. with", "B. for", "C. in", "D. to"], correctIndex: 1 },
            { id: "q36", section: "VOCABULARY AND GRAMMAR", text: "It was in 2010 ______ they first met each other in London.", options: ["A. that", "B. which", "C. when", "D. where"], correctIndex: 0 },
            { id: "q37", section: "VOCABULARY AND GRAMMAR", text: "______ her household chores early, she had more time to study for the exam.", options: ["A. Having finished", "B. Finishing", "C. Finishes", "D. Finish"], correctIndex: 0 },
            { id: "q38", section: "VOCABULARY AND GRAMMAR", text: "We should ______ the natural light to save energy in our classroom.", options: ["A. make use of", "B. come up with", "C. get into", "D. look forward to"], correctIndex: 0 },

            // ANNOUNCEMENT/ADVERTISEMENT/LEAFLET (Unit 6)
            { id: "q39", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "Preserving the Old Citadel – A Call for Volunteers!<br>We are looking for energetic students to join our heritage preservation project. This is a great chance to contribute (20) _____ the protection of our local history.", options: ["A. with", "B. in", "C. at", "D. to"], correctIndex: 3 },
            { id: "q40", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "Activities include: • Cleaning historical sites and (21) _____ ancient relics.", options: ["A. destroying", "B. identifying", "C. preserving", "D. removing"], correctIndex: 2 },
            { id: "q41", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Guiding tourists through the world (22) _____ sites.", options: ["A. culture", "B. heritage", "C. nature", "D. custom"], correctIndex: 1 },
            { id: "q42", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "DAN CA QUAN HO FESTIVAL<br>Event Features: • Enjoy (23) _____ singing performances by local artists.", options: ["A. tradition", "B. traditional", "C. traditionally", "D. traditionalism"], correctIndex: 1 },
            { id: "q43", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Discover (24) _____ ancient artifacts in the museum.", options: ["A. much", "B. many", "C. a few", "D. few"], correctIndex: 1 },
            { id: "q44", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Our organization ensures this event (25) _____ the best cultural experience!", options: ["A. is", "B. are", "C. was", "D. were"], correctIndex: 0 },

            // ANNOUNCEMENT/ADVERTISEMENT/LEAFLET (Unit 7)
            { id: "q45", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "Career Fair for School-Leavers<br>Are you confused about your future? Don't miss out! Our Career Fair will help you find the best path. Sign (20) _____ today to explore various vocational options.", options: ["A. up", "B. down", "C. off", "D. out"], correctIndex: 0 },
            { id: "q46", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Tips for (21) _____ practical experience through internships.", options: ["A. losing", "B. gaining", "C. missing", "D. failing"], correctIndex: 1 },
            { id: "q47", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Advice on how to succeed in the modern (22) _____.", options: ["A. classroom", "B. workplace", "C. playground", "D. library"], correctIndex: 1 },
            { id: "q48", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "VOCATIONAL COLLEGE ADMISSIONS<br>Why choose us? • We provide (23) _____ support for students in need.", options: ["A. finance", "B. financial", "C. financially", "D. financier"], correctIndex: 1 },
            { id: "q49", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• (24) _____ modern facilities including labs and workshops.", options: ["A. many", "B. a lot of", "C. number of", "D. few"], correctIndex: 1 },
            { id: "q50", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Our college (25) _____ a wide range of short-term courses.", options: ["A. offer", "B. offers", "C. offering", "D. offered"], correctIndex: 1 },

            // ANNOUNCEMENT/ADVERTISEMENT/LEAFLET (Unit 8)
            { id: "q51", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "Workshop: Becoming Independent<br>Transitioning (20) _____ adulthood can be tough. Join our weekend session to master the art of living alone.", options: ["A. into", "B. for", "C. to", "D. on"], correctIndex: 0 },
            { id: "q52", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• (21) _____ your self-confidence in making decisions.", options: ["A. increasing", "B. boosting", "C. losing", "D. training"], correctIndex: 1 },
            { id: "q53", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Finding the right (22) _____ for your daily life problems.", options: ["A. solution", "B. success", "C. problem", "D. failure"], correctIndex: 0 },
            { id: "q54", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "HOME MANAGEMENT CLASS<br>Class Highlights: • Learn to be (23) _____ for your own living space.", options: ["A. responsible", "B. responsibility", "C. responsibly", "D. responsive"], correctIndex: 0 },
            { id: "q55", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• Get (24) _____ useful tips on laundry and cleaning.", options: ["A. much", "B. little", "C. lots of", "D. a little"], correctIndex: 2 },
            { id: "q56", section: "ANNOUNCEMENT/ADVERTISEMENT/LEAFLET", text: "• An expert (25) _____ you how to manage your time.", options: ["A. teach", "B. teaches", "C. teaching", "D. taught"], correctIndex: 1 },

            // TEXT ARRANGEMENT
            { id: "q57", section: "TEXT ARRANGEMENT", text: "Question 26 - Unit 6:<br>a. Finally, digital technology can help document and store these values for the future.<br>b. Preserving our cultural heritage is essential for maintaining our identity.<br>c. Secondly, local communities should be encouraged to participate in restoration projects.<br>d. First, we need to raise awareness among young people about the value of ancient relics.", options: ["A. b-d-c-a", "B. b-c-a-d", "C. d-a-c-b", "D. d-b-a-c"], correctIndex: 0 },
            { id: "q58", section: "TEXT ARRANGEMENT", text: "Question 27 - Unit 6:<br>a. The ancient citadel is currently in need of urgent restoration.<br>b. Dear Residents,<br>c. Please join our fundraising event this Sunday to help save this historic landmark.", options: ["A. b-a-c", "B. a-b-c", "C. b-c-a", "D. c-b-a"], correctIndex: 0 },
            { id: "q59", section: "TEXT ARRANGEMENT", text: "Question 26 - Unit 7:<br>a. Moreover, university life helps students develop soft skills like teamwork and leadership.<br>b. Pursuing higher education offers many benefits for school-leavers.<br>c. In conclusion, whether it's a degree or a trade, further study is a key to success.<br>d. Firstly, it provides the necessary qualifications for a professional career.", options: ["A. b-d-a-c", "B. b-c-a-d", "C. d-a-c-b", "D. a-b-c-d"], correctIndex: 0 },
            { id: "q60", section: "TEXT ARRANGEMENT", text: "Question 27 - Unit 7:<br>a. Our vocational school offers various courses in IT and mechanics.<br>b. Want to start your career early?<br>c. Contact us today for more information about the new semester!", options: ["A. b-a-c", "B. a-b-c", "C. c-b-a", "D. b-c-a"], correctIndex: 0 },
            { id: "q61", section: "TEXT ARRANGEMENT", text: "Question 26 - Unit 8:<br>a. In addition, knowing how to manage money prevents you from getting into debt.<br>b. Being independent requires a set of essential life skills.<br>c. Finally, time management allows you to balance work and relaxation effectively.<br>d. For instance, cooking for yourself ensures you have a healthy diet.", options: ["A. b-d-a-c", "B. b-c-a-d", "C. d-a-c-b", "D. a-b-c-d"], correctIndex: 0 },
            { id: "q62", section: "TEXT ARRANGEMENT", text: "Question 27 - Unit 8:<br>a. Learn to cook, clean, and manage your budget with our experts.<br>b. Do you want to live on your own confidently?<br>c. Sign up for our 'Life Skills for Teens' workshop this summer!", options: ["A. b-a-c", "B. a-b-c", "C. b-c-a", "D. c-a-b"], correctIndex: 0 },

            // READING (Unit 6)
            { id: "q63", section: "READING (Unit 6)", text: "<strong>THE CHALLENGE OF PRESERVING OUR HERITAGE</strong><br>Preserving our heritage is a vital goal for every nation as it moves toward a more modernized and globalized future... (Đoạn văn trong ảnh)<br><br>Question 1: What is the passage mainly about?", options: ["A. The history of ancient architecture in Vietnam.", "B. The significance of government funding in tourism.", "C. The importance and challenges of preserving cultural heritage.", "D. The impact of modern commercialization on local education."], correctIndex: 2 },
            { id: "q64", section: "READING (Unit 6)", text: "Question 2: The phrase 'intangible values' in the passage refers to ______.", options: ["A. physical buildings and monuments.", "B. values that cannot be touched, such as stories and music.", "C. expensive artifacts sold in museums.", "D. modern technology used in digital archiving."], correctIndex: 1 },
            { id: "q65", section: "READING (Unit 6)", text: "Question 3: According to the passage, what is an internal challenge in heritage preservation?", options: ["A. The rise of sustainable tourism models.", "B. Anxiety about cultural loss and lack of cultural literacy among youth.", "C. An abundance of funding for restoring ancient sites.", "D. The development of high-tech digital archives."], correctIndex: 1 },
            { id: "q66", section: "READING (Unit 6)", text: "Question 4: The word 'which' in the third paragraph refers to ______.", options: ["A. over-tourism in historical areas.", "B. the fact that over-tourism prevents sites from remaining in their original state.", "C. the development of sustainable tourism.", "D. local communities feeling overwhelmed."], correctIndex: 1 },
            { id: "q67", section: "READING (Unit 6)", text: "Question 5: Which of the following is NOT true according to the passage?", options: ["A. Preserving heritage helps young people build pride in their roots.", "B. Modern commercialization can sometimes lead to 'fake traditions.'", "C. Only the government is responsible for protecting historical monuments.", "D. Teenagers can contribute to preservation through small actions like visiting museums."], correctIndex: 2 },

            // READING (Unit 7)
            { id: "q68", section: "READING (Unit 7)", text: "<strong>EDUCATION PATHWAYS FOR SCHOOL-LEAVERS</strong><br>After finishing high school, many students face the difficult and often stressful choice between pursuing a university degree or choosing vocational education. This critical transition involves much more than just picking a subject; it requires young people to evaluate their personal strengths and long-term career aspirations... (Đoạn văn trong ảnh)<br><br>Question 1: What is the passage mainly about?", options: ["A. The history of vocational schools.", "B. Different educational paths and challenges for school-leavers.", "C. How to become a doctor or an engineer.", "D. The importance of traveling during a gap year."], correctIndex: 1 },
            { id: "q69", section: "READING (Unit 7)", text: "Question 2: The phrase 'hands-on' in the passage is closest in meaning to ______.", options: ["A. theoretical", "B. impractical", "C. practical", "D. boring"], correctIndex: 2 },
            { id: "q70", section: "READING (Unit 7)", text: "Question 3: According to the passage, why is a 'gap year' beneficial for some students?", options: ["A. It allows them to avoid studying forever.", "B. It helps them gain maturity and self-understanding.", "C. It is the only way to save money for university.", "D. It guarantees a high-paying job immediately."], correctIndex: 1 },
            { id: "q71", section: "READING (Unit 7)", text: "Question 4: The word 'They' in the second paragraph refers to ______.", options: ["A. vocational skills", "B. university programs", "C. school-leavers", "D. formal qualifications"], correctIndex: 2 },
            { id: "q72", section: "READING (Unit 7)", text: "Question 5: Which of the following is NOT true according to the passage?", options: ["A. University is suitable for those seeking professional careers like law or medicine.", "B. Vocational education often leads to entering the workforce earlier.", "C. Family expectations never influence a student's choice of career.", "D. Lifelong learning is necessary in today's fast-changing job market."], correctIndex: 2 },

            // READING (Unit 8)
            { id: "q73", section: "READING (Unit 8)", text: "<strong>BECOMING INDEPENDENT</strong><br>Becoming independent is a vital goal for most teenagers as they move toward adulthood. This process involves learning how to manage daily tasks and making important decisions without always relying on parents... (Đoạn văn trong ảnh)<br><br>Question 1: What is the passage mainly about?", options: ["A. Vietnam's challenges in education", "B. The significance of parental support", "C. The process and challenges of becoming independent", "D. Economic competition among young people"], correctIndex: 2 },
            { id: "q74", section: "READING (Unit 8)", text: "Question 2: The phrase 'master life skills' in the passage means ______.", options: ["A. learn to do things well", "B. avoid difficult tasks", "C. teach others how to live", "D. depend on someone else"], correctIndex: 0 },
            { id: "q75", section: "READING (Unit 8)", text: "Question 3: According to the passage, what is an internal challenge that teenagers face?", options: ["A. High levels of skilled labor", "B. Strong competitiveness in schools", "C. Anxiety about making mistakes and lack of financial knowledge", "D. An abundance of finished goods for export"], correctIndex: 2 },
            { id: "q76", section: "READING (Unit 8)", text: "Question 4: The word 'which' in the passage refers to ______.", options: ["A. overprotective parents", "B. preventing children from making choices", "C. development of skills", "D. problem-solving skills"], correctIndex: 1 },
            { id: "q77", section: "READING (Unit 8)", text: "Question 5: Which of the following is NOT true according to the passage?", options: ["A. Teenagers face challenges in both internal and external factors.", "B. Social media pressure can make young people feel overwhelmed.", "C. Vietnam has fully adapted its strategies to address independence.", "D. Recognizing the importance of life skills can help teenagers live responsibly."], correctIndex: 2 }
        ]
    },
    {
        id: "biology_grade_11_gk2",
        title: "Sinh 11 - Giữa Kỳ II",
        description: "Đề kiểm tra trắc nghiệm môn Sinh học lớp 11 - Nội dung Cảm ứng, Sinh trưởng và Phát triển. Bao gồm 3 dạng câu hỏi: Trắc nghiệm, Đúng/Sai và Trả lời ngắn.",
        questions: [
            // PHẦN I: TRẮC NGHIỆM
            { id: "bio_q1", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Các số (1) và (2) trong hình cấu trúc neuron tương ứng với thành phần nào? <br>(1: Thân neuron, 2: Sợi nhánh)", options: ["A. Sợi nhánh và thân neuron", "B. Nhân và sợi nhánh", "C. Thân neuron và sợi nhánh", "D. Sợi trục và nhân"], correctIndex: 2 },
            { id: "bio_q2", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Các tế bào thần kinh có vai trò tiếp nhận, xử lý và ...... trong hệ thần kinh.", options: ["A. thu nhận thông tin", "B. Truyền xung thần kinh", "C. phân tích thông tin", "D. Báo cáo thông tin"], correctIndex: 1 },
            { id: "bio_q3", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Cung phản xạ: Cơ quan tiếp nhận kích thích (da) -> Cơ quan phân tích -> Cơ quan đáp ứng (cơ tay). Thứ tự lần lượt là?", options: ["A. Thụ quan cảm giác đau ở da -> tủy sống -> cơ tay", "B. Thụ quan cảm giác đau ở da -> neuron hướng tâm -> cơ tay", "C. Thụ quan cảm giác đau ở da -> tủy sống -> neuron ly tâm", "D. Thụ quan cảm giác đau ở da -> neuron hướng tâm -> xương sống"], correctIndex: 0 },
            { id: "bio_q4", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Buổi sáng nghe thấy chuông báo thức sẽ bật dậy. Đây là ví dụ của loại phản xạ nào?", options: ["A. Phản xạ không điều kiện", "B. Phản xạ có điều kiện", "C. Phản xạ có điều kiện và không điều kiện", "D. Không có phản xạ"], correctIndex: 1 },
            { id: "bio_q5", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Tập tính là:", options: ["A. những hoạt động của cơ thể động vật thích nghi với môi trường sống", "B. sự vận động sinh trưởng về mọi phía theo các tác nhân bên trong hay bên ngoài", "C. vận động sinh trưởng định hướng theo các tác nhân một phía của môi trường", "D. những hành động của động vật trả lời lại kích thích từ môi trường trong và ngoài"], correctIndex: 3 },
            { id: "bio_q6", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Điều kiện hóa hành động là kiểu liên kết giữa:", options: ["A. các hành vi của động vật và các kích thích", "B. một hành vi của động vật với một phần thưởng", "C. một hành vi của động vật và một kích thích", "D. hai hành vi của động vật với nhau"], correctIndex: 1 },
            { id: "bio_q7", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "In vết là hình thức học tập mà con vật mới sinh ra:", options: ["A. bám theo vật thể tĩnh mà nó nhìn thấy đầu tiên", "B. bám theo vật thể chuyển động mà nó nhìn thấy đầu tiên", "C. bám theo vật thể chuyển động bất kỳ", "D. bám theo mẹ nó"], correctIndex: 1 },
            { id: "bio_q8", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Học ngầm là kiểu học không có ý thức, sau đó những điều đã học:", options: ["A. không được dùng đến nên động vật sẽ quên đi", "B. lại được củng cố bằng các hoạt động có ý thức", "C. được tái hiện giúp động vật giải quyết tình huống tương tự", "D. được tái hiện giúp động vật giải quyết tình huống khác lạ"], correctIndex: 2 },
            { id: "bio_q9", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Tinh tinh con học cách đập vỡ vỏ hạt cứng bằng cách quan sát tinh tinh mẹ. Ví dụ về:", options: ["A. Học tập qua giao tiếp xã hội", "B. In vết", "C. Học liên hệ", "D. Quen nhờn"], correctIndex: 0 },
            { id: "bio_q10", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Tập tính nào là bẩm sinh: (1) Di cư cá hồi, (3) Nhện giăng tơ, (6) Ếch kêu mùa sinh sản, (8) Ve kêu mùa hè. Tập tính nào học được: (2) Báo săn mồi, (4) Vẹt nói tiếng người, (5) Cá nổi lên tìm thức ăn, (7) Xiếc chó.", options: ["A. Bẩm sinh: (1,3,6,8); Học được: (2,4,5,7)", "B. Bẩm sinh: (1,2,6,8); Học được: (3,4,5,7)", "C. Bẩm sinh: (1,3,5,8); Học được: (2,4,6,7)", "D. Bẩm sinh: (1,3,6,7); Học được: (2,4,5,8)"], correctIndex: 0 },
            { id: "bio_q11", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Sinh trưởng ở sinh vật là:", options: ["A. quá trình tăng chiều cao", "B. quá trình tăng về kích thước cơ thể", "C. quá trình tăng số lượng tế bào", "D. quá trình tăng về kích thước và khối lượng cơ thể do tăng số lượng/kích thước tế bào"], correctIndex: 3 },
            { id: "bio_q12", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Ghép cột: 1. Sinh trưởng (b: Cây lên cao, e: Diện tích lá tăng, f: Lợn tăng cân); 2. Phát triển (a: Hạt nảy mầm, c: Gà gáy, d: Cây ra hoa).", options: ["A. 1 - b,d,f ; 2 - a,c,e", "B. 1 - b,e,f ; 2 - a,c,d", "C. 1 - a,b,e ; 2 - c,d,f", "D. 1 - a,b,f ; 2 - c,d,e"], correctIndex: 1 },
            { id: "bio_q13", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Hormone thực vật là những chất hữu cơ cho cơ thể thực vật tiết ra:", options: ["A. có tác dụng điều hòa", "B. chỉ có tác dụng ức chế", "C. có tác dụng kháng bệnh", "D. có tác dụng kích thích sinh trưởng"], correctIndex: 0 },
            { id: "bio_q14", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Chức năng của mô phân sinh đỉnh là gì?", options: ["A. Làm cho thân và rễ cây dài ra", "B. Làm cho rễ dài và to ra", "C. Làm cho thân cây dài và to ra", "D. Làm cho thân cây, cành cây to ra"], correctIndex: 0 },
            { id: "bio_q15", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Có bao nhiêu phát biểu đúng về mô phân sinh? (II: MS đỉnh ở đỉnh rễ/chồi; V: MS lóng chỉ có ở cây Một lá mầm)", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correctIndex: 1 },
            { id: "bio_q16", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Sinh trưởng thứ cấp theo thứ tự từ ngoài vào trong thân là:", options: ["A. Bần -> tầng sinh bần -> mạch rây sơ cấp -> mạch rây thứ cấp -> tầng sinh mạch -> mạch gỗ thứ cấp -> mạch gỗ sơ cấp -> tủy", "B. Bần -> tầng sinh bần -> mạch rây thứ cấp -> mạch rây sơ cấp -> tầng sinh mạch -> mạch gỗ thứ cấp -> mạch gỗ sơ cấp -> tủy", "C. Bần -> tầng sinh bần -> mạch rây sơ cấp -> mạch rây thứ cấp -> tầng sinh mạch -> mạch gỗ sơ cấp -> mạch gỗ thứ cấp -> tủy", "D. Tầng sinh bần -> bần -> mạch rây sơ cấp -> mạch rây thứ cấp -> tầng sinh mạch -> mạch gỗ thứ cấp -> mạch gỗ sơ cấp -> tủy"], correctIndex: 0 },
            { id: "bio_q18", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Cảm ứng là:", options: ["A. sự phản ứng đối với thay đổi môi trường", "B. sự tiếp nhận của sinh vật đối với thay đổi môi trường", "C. sự tiếp nhận và phản ứng đối với những thay đổi của môi trường để thích ứng", "D. sự lan truyền xung thần kinh"], correctIndex: 2 },
            { id: "bio_q19", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Ở người, khi ánh sáng mạnh chiếu vào mắt thì đồng tử co lại nhằm:", options: ["A. giúp mắt nhìn thấy ánh sáng nhiều hơn", "B. giúp mắt mở to hơn", "C. tránh cho mắt nhắm lại", "D. tránh cho mắt bị tổn thương"], correctIndex: 3 },
            { id: "bio_q20", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Cảm ứng ở sinh vật được thực hiện thông qua bộ phận nào?", options: ["A. tiếp nhận kích thích, dẫn truyền và đáp ứng", "B. tiếp nhận kích thích, xử lí thông tin và đáp ứng", "C. dẫn truyền thông tin, xử lí thông tin và đáp ứng", "D. tiếp nhận, dẫn truyền, xử lí thông tin và đáp ứng"], correctIndex: 3 },
            { id: "bio_q21", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Các tác nhân của môi trường tác động tới cơ thể được gọi là:", options: ["A. các kích thích", "B. các nhận biết", "C. các đáp ứng", "D. các cảm ứng"], correctIndex: 0 },
            { id: "bio_q22", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Chậu cây bên cửa sổ, sau một thời gian ngọn cây vươn ra ngoài cửa sổ. Đây là quá trình:", options: ["A. Quang hợp", "B. Hô hấp", "C. Thoát hơi nước", "D. Cảm ứng"], correctIndex: 3 },
            { id: "bio_q23", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Cảm ứng ở thực vật biểu hiện bằng:", options: ["A. sự thay đổi hình thái các cơ quan", "B. sự vận động của các cơ quan theo hướng xác định", "C. sự tiếp nhận kích thích từ một hướng xác định", "D. sự vận động của cơ quan khi nhận kích thích có định hướng hoặc không"], correctIndex: 3 },
            { id: "bio_q24", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Hướng động là hình thức phản ứng của cây đối với:", options: ["A. tác nhân kích thích không định hướng", "B. tác nhân kích thích từ một hướng xác định", "C. sự đóng mở của khí khổng", "D. các chất hóa học"], correctIndex: 1 },
            { id: "bio_q25", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Ứng động là hình thức phản ứng của cây đối với:", options: ["A. tác nhân kích thích không định hướng", "B. tác nhân kích thích từ một hướng xác định", "C. tác nhân kích thích có hướng và vô hướng", "D. các chất hóa học"], correctIndex: 0 },
            { id: "bio_q26", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Trường hợp nào sau đây là ứng động không sinh trưởng?", options: ["A. Hoa bồ công anh nở khi có ánh sáng", "B. Vận động ngủ, thức của chồi cây", "C. Tua cuốn của cây mướp quấn trên giàn", "D. Hiện tượng cụp lá ở cây trinh nữ"], correctIndex: 3 },
            { id: "bio_q27", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Dây leo quấn quanh những cây gỗ lớn để vươn lên cao là kết quả của:", options: ["A. hướng trọng lực âm", "B. hướng tiếp xúc", "C. hướng nước", "D. cả 3 đáp án trên"], correctIndex: 1 },
            { id: "bio_q28", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Trong hệ thần kinh dạng ống, não gồm những phần nào?", options: ["A. Bán cầu đại não, não trung gian, não giữa, hành và tủy não", "B. Bán cầu đại não, não trung gian, củ não sinh tư, tiểu não và hành tủy", "C. Bán cầu đại não, não trung gian, não giữa, tiểu não và hành - cầu não", "D. Bán cầu đại não, não trung gian, cuống não, tiểu não và hành - cầu não"], correctIndex: 2 },
            { id: "bio_q29", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Phản xạ đơn giản được thực hiện trên cung phản xạ do:", options: ["A. số lượng lớn tế bào thần kinh điều khiển", "B. số lượng ít tế bào thần kinh và do não bộ điều khiển", "C. một số tế bào thần kinh nhất định và do tủy sống điều khiển", "D. một số lượng lớn tế bào thần kinh và do vỏ não điều khiển"], correctIndex: 2 },
            { id: "bio_q30", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Điều không đúng với đặc điểm phản xạ có điều kiện là:", options: ["A. được hình thành trong quá trình sống", "B. không di truyền, mang tính cá thể", "C. có số lượng hạn chế", "D. thường do vỏ não điều khiển"], correctIndex: 2 },
            { id: "bio_q35", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Chiều hướng tiến hóa của hệ thần kinh là:", options: ["A. từ dạng lưới -> chuỗi hạch -> dạng ống", "B. tiết kiệm năng lượng trong phản xạ", "C. phản ứng chính xác và thích ứng trước kích thích", "D. tăng lượng phản xạ nên cần nhiều thời gian để phản ứng"], correctIndex: 0 },
            { id: "bio_q36", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Thụ thể tiếp nhận chất trung gian hóa học nằm ở:", options: ["A. màng trước xináp", "B. khe xináp", "C. chùy xináp", "D. màng sau xináp"], correctIndex: 3 },
            { id: "bio_q37", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Quá trình truyền tin qua xináp diễn ra theo trật tự:", options: ["A. Khe xináp -> màng trước -> chùy -> màng sau", "B. Chùy xináp -> màng trước -> khe -> màng sau", "C. Màng sau -> khe -> chùy -> màng trước", "D. Màng trước -> chùy -> khe -> màng sau"], correctIndex: 1 },
            { id: "bio_q38", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Trong xináp, chất trung gian hóa học nằm ở:", options: ["A. màng trước xináp", "B. chùy xináp", "C. màng sau xináp", "D. khe xináp"], correctIndex: 1 },
            { id: "bio_q39", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Tập tính học được là loại tập tính được hình thành trong quá trình:", options: ["A. sống của cá thể, thông qua học tập và rút kinh nghiệm", "B. phát triển của loài, thông qua học tập", "C. sống của cá thể nhưng có tính di truyền", "D. sống của cá thể, đặc trưng cho loài"], correctIndex: 0 },
            { id: "bio_q40", section: "PHẦN I: TRẮC NGHIỆM", type: "multiple_choice", text: "Ve sầu kêu vào mùa hè, ếch đực kêu mùa sinh sản là tập tính:", options: ["A. học được", "B. bẩm sinh", "C. hỗn hợp", "D. vừa bẩm sinh vừa hỗn hợp"], correctIndex: 1 },

            // PHẦN II: ĐÚNG / SAI
            { id: "bio_tf1_a", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Dừng xe trước vạch kẻ khi thấy đèn tín hiệu chuyển sang màu đỏ là Phản xạ có điều kiện?", correctIndex: 0 },
            { id: "bio_tf1_b", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Người run lập cập khi mặc không đủ ấm trong tiết trời lạnh giá là Phản xạ có điều kiện?", correctIndex: 1 },
            { id: "bio_tf1_c", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Thở nhanh khi không khí trong phòng không đủ O2 là Phản xạ có điều kiện?", correctIndex: 1 },
            { id: "bio_tf1_d", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Tìm cách tránh xa khi gặp chó dại trên đường là Phản xạ có điều kiện?", correctIndex: 0 },
            { id: "bio_tf2_a", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Con bò tăng khối lượng từ 50kg đến 100kg là biểu hiện sự sinh trưởng?", correctIndex: 0 },
            { id: "bio_tf2_b", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Con gà trống mọc mào là biểu hiện sự sinh trưởng?", correctIndex: 1 },
            { id: "bio_tf2_c", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Con gà mái đẻ trứng là biểu hiện sự sinh trưởng?", correctIndex: 1 },
            { id: "bio_tf2_d", section: "PHẦN II: ĐÚNG / SAI", type: "true_false", text: "Con rắn tăng chiều dài cơ thể thêm 20cm là biểu hiện sự sinh trưởng?", correctIndex: 0 },

            // PHẦN III: TRẢ LỜI NGẮN
            { id: "bio_sa1", section: "PHẦN III: TRẢ LỜI NGẮN", type: "short_answer", text: "Trong số các hormone: auxin, gibberellin, cytokinin, abscisic acid, ethylene, thyroxine, estrogen. Có bao nhiêu hormone có ở thực vật?", correctAnswer: "5" },
            { id: "bio_sa2", section: "PHẦN III: TRẢ LỜI NGẮN", type: "short_answer", text: "Cho các nhân tố: di truyền, hormone, ánh sáng, nhiệt độ, chất dinh dưỡng. Có bao nhiêu nhân tố BÊN NGOÀI chi phối phát triển thực vật?", correctAnswer: "3" },
            { id: "bio_sa4", section: "PHẦN III: TRẢ LỜI NGẮN", type: "short_answer", text: "Các kiểu hướng động âm (tránh xa nguồn kích thích) ở rễ là hướng nào? (1. Sáng, 2. Hóa, 3. Nước, 4. Trọng lực, 5. Tiếp xúc)", correctAnswer: "1" }
        ]
    }
];

// === TRẠNG THÁI (STATE) ===
let currentQuiz = null;
let userAnswers = {};

// === PHẦN TỬ DOM ===
const views = {
    list: document.getElementById('quizListView'),
    setup: document.getElementById('setupView'),
    active: document.getElementById('activeQuizView'),
    result: document.getElementById('resultView')
};

const quizListContainer = document.getElementById('quizList');
const questionsContainer = document.getElementById('questionsContainer');
const currentQuizTitle = document.getElementById('currentQuizTitle');
const quizForm = document.getElementById('quizForm');

// === HÀM CHUYỂN ĐỔI MÀN HÌNH ===
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === TẠO GIAO DIỆN DANH SÁCH ĐỀ ===
function initQuizList() {
    quizListContainer.innerHTML = '';
    mockQuizzes.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'quiz-card';
        card.innerHTML = `
            <h3>${quiz.title}</h3>
            <p>${quiz.description}</p>
            <div class="tags-container" style="margin-bottom: 24px; display: flex; align-items: center;">
                <span class="quiz-meta">📚 Số câu: ${quiz.questions.length}</span>
                <span class="quiz-views" id="views-${quiz.id}">Lượt truy cập: Đang tải...</span>
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="startQuiz('${quiz.id}')">Bắt Đầu Làm Bài</button>
        `;
        quizListContainer.appendChild(card);
    });
    initRealtimeViews();
}

// === LẮNG NGHE DỮ LIỆU LƯỢT TRUY CẬP THỜI GIAN THỰC TỪ REALTIME DATABASE ===
function initRealtimeViews() {
    try {
        // Lắng nghe tất cả các đề cùng một lúc từ nút 'quiz_views'
        const viewsRef = ref(dbRT, 'quiz_views');
        onValue(viewsRef, (snapshot) => {
            const allViews = snapshot.val() || {};

            mockQuizzes.forEach(quiz => {
                const viewCount = allViews[quiz.id] || 0;
                const viewEl = document.getElementById(`views-${quiz.id}`);
                if (viewEl) {
                    viewEl.innerHTML = `Lượt truy cập: ${viewCount}`;
                }
            });
        }, (error) => {
            console.error("Lỗi lắng nghe Realtime Database:", error);
        });
    } catch (error) {
        console.error("Lỗi khởi tạo tính năng thời gian thực:", error);
    }
}

// === HÀM ĐẢO CÂU HỎI THEO PHẦN ===
function shuffleQuestionsBySection(questions) {
    const sections = [];
    questions.forEach(q => {
        if (!sections.includes(q.section)) {
            sections.push(q.section);
        }
    });

    let shuffled = [];
    sections.forEach(sec => {
        let group = questions.filter(q => q.section === sec);
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        shuffled = shuffled.concat(group);
    });
    return shuffled;
}

// === BẮT ĐẦU LÀM BÀI ===
window.startQuiz = async function (quizId) {
    currentQuiz = mockQuizzes.find(q => q.id === quizId);
    if (!currentQuiz) return;

    // Hiển thị màn hình cấu hình trước
    document.getElementById('setupQuizTitle').textContent = `Cấu hình: ${currentQuiz.title}`;
    showView('setup');
};

// === XÁC NHẬN BẮT ĐẦU LÀM BÀI SAU KHI CẤU HÌNH ===
document.getElementById('btnConfirmStart').onclick = async function () {
    const isShuffle = document.getElementById('chkShuffle').checked;
    const quizMode = document.querySelector('input[name="quizMode"]:checked').value;

    // Lưu lại cấu hình vào dataset của form hoặc biến state
    quizForm.dataset.quizMode = quizMode;
    quizForm.dataset.isShuffle = isShuffle;

    // --- HIỂN THỊ GIAO DIỆN LÀM BÀI ---
    if (isShuffle) {
        currentQuiz.questions = shuffleQuestionsBySection(currentQuiz.questions);
    }

    // Xóa kết quả chọn cũ & Reset form
    quizForm.reset();
    quizForm.dataset.mode = 'exam'; // Mặc định là chế độ thi cử khi bắt đầu
    const submitBtn = quizForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Nộp Bài Ngay';
        submitBtn.classList.remove('btn-outline');
        submitBtn.classList.add('btn-primary');
    }

    currentQuizTitle.textContent = currentQuiz.title;
    renderQuestions();
    showView('active');

    // Tăng lượt xem (view) trên Realtime Database chạy ngầm
    try {
        const quizId = currentQuiz.id;
        let viewedQuizzes = [];
        try {
            viewedQuizzes = JSON.parse(localStorage.getItem('viewedQuizzes') || '[]');
        } catch (err) {
            viewedQuizzes = [];
        }

        if (!Array.isArray(viewedQuizzes)) viewedQuizzes = [];

        if (!viewedQuizzes.includes(quizId)) {
            viewedQuizzes.push(quizId);
            localStorage.setItem('viewedQuizzes', JSON.stringify(viewedQuizzes));

            const quizViewRef = ref(dbRT, `quiz_views/${quizId}`);
            try {
                runTransaction(quizViewRef, (currentValue) => {
                    return (currentValue || 0) + 1;
                });
            } catch (error) {
                console.error("Lỗi khi cập nhật Realtime view:", error);
            }
        }
    } catch (e) {
        console.error("Lỗi logic lượt xem:", e);
    }
};

document.getElementById('btnBackFromSetup').onclick = () => showView('list');

// === HÀM HIỂN THỊ TRỢ GIÚP ===
window.showHelp = function (type) {
    let msg = "";
    if (type === 'shuffle') {
        msg = "Tráo thứ tự câu hỏi: Các câu hỏi trong mỗi phần sẽ được đảo vị trí ngẫu nhiên để tăng tính thử thách.";
    } else if (type === 'mode') {
        msg = "Chế độ làm bài:\n- Thi cử: Chỉ xem được kết quả và đáp án sau khi nhấn Nộp bài.\n- Luyện tập: Thấy ngay đáp án đúng/sai ngay sau khi bạn chọn mỗi câu hỏi.";
    }
    alert(msg);
};

// === KIẾN TẠO GIAO DIỆN CÂU HỎI TRONG ĐỀ ===
function renderQuestions() {
    questionsContainer.innerHTML = '';
    let currentSection = "";
    let sectionQuestionIndex = 1;

    currentQuiz.questions.forEach((q, index) => {
        // Render phần tiêu đề nhóm câu hỏi nếu có
        if (q.section && q.section !== currentSection) {
            const secHeader = document.createElement('h3');
            secHeader.className = 'section-title';
            secHeader.style.marginTop = '32px';
            secHeader.style.marginBottom = '16px';
            secHeader.style.color = 'var(--primary)';
            secHeader.style.textTransform = 'uppercase';
            secHeader.textContent = q.section;
            questionsContainer.appendChild(secHeader);
            currentSection = q.section;
            sectionQuestionIndex = 1;
        }

        const qBlock = document.createElement('div');
        qBlock.className = 'question-card';

        const qTitle = document.createElement('h4');
        qTitle.innerHTML = `Câu ${sectionQuestionIndex}: ${q.text || ''}`;
        if (!q.text) qTitle.style.marginBottom = '12px';
        qBlock.appendChild(qTitle);

        const optionsList = document.createElement('div');
        optionsList.className = 'options-list';

        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const opts = qType === 'true_false' ? ["Đúng", "Sai"] : q.options;
            opts.forEach((opt, optIndex) => {
                const label = document.createElement('label');
                label.className = 'option-label';
                label.innerHTML = `
                    <input type="radio" name="question_${q.id}" value="${optIndex}">
                    <span>${opt}</span>
                `;

                const radio = label.querySelector('input');
                radio.addEventListener('change', () => {
                    if (quizForm.dataset.quizMode === 'practice') {
                        const allInputs = optionsList.querySelectorAll('input');
                        allInputs.forEach(input => {
                            input.disabled = true;
                            const parentLabel = input.closest('label');
                            const val = parseInt(input.value);
                            if (val === q.correctIndex) {
                                parentLabel.classList.add('correct-answer');
                            } else if (input.checked) {
                                parentLabel.classList.add('wrong-answer');
                            }
                        });
                    }
                });
                optionsList.appendChild(label);
            });
        } else if (qType === 'short_answer') {
            const inputField = document.createElement('div');
            inputField.className = 'short-answer-container';
            inputField.style.marginTop = '10px';
            inputField.innerHTML = `
                <input type="number" name="question_${q.id}" class="form-control" placeholder="Nhập số đáp án..." style="width: 200px; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                <div class="practice-result" style="display:none; margin-top: 5px; font-weight: 600;"></div>
            `;
            
            const input = inputField.querySelector('input');
            input.addEventListener('change', () => {
                if (quizForm.dataset.quizMode === 'practice') {
                    const resDiv = inputField.querySelector('.practice-result');
                    resDiv.style.display = 'block';
                    input.disabled = true;
                    if (input.value.trim() == q.correctAnswer) {
                        resDiv.textContent = 'Chính xác! Đáp án: ' + q.correctAnswer;
                        resDiv.style.color = 'var(--correct)';
                        input.style.borderColor = 'var(--correct)';
                    } else {
                        resDiv.textContent = 'Sai rồi! Đáp án đúng: ' + q.correctAnswer;
                        resDiv.style.color = 'var(--wrong)';
                        input.style.borderColor = 'var(--wrong)';
                    }
                }
            });
            optionsList.appendChild(inputField);
        }

        qBlock.appendChild(optionsList);
        questionsContainer.appendChild(qBlock);
        sectionQuestionIndex++;
    });
}

// === XỬ LÝ KHI NỘP BÀI TẬP ===
quizForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Nếu đang ở chế độ xem lại (review), nhấn nút sẽ quay lại màn kết quả
    if (quizForm.dataset.mode === 'review') {
        showView('result');
        return;
    }

    // Chấm điểm
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    userAnswers = {};

    currentQuiz.questions.forEach(q => {
        const qType = q.type || 'multiple_choice';
        
        if (qType === 'multiple_choice' || qType === 'true_false') {
            const selectedRadio = quizForm.querySelector(`input[name="question_${q.id}"]:checked`);
            if (!selectedRadio) {
                unanswered++;
                userAnswers[q.id] = null;
            } else {
                const val = parseInt(selectedRadio.value);
                userAnswers[q.id] = val;
                if (val === q.correctIndex) {
                    correct++;
                } else {
                    incorrect++;
                }
            }
        } else if (qType === 'short_answer') {
            const input = quizForm.querySelector(`input[name="question_${q.id}"]`);
            const val = input.value.trim();
            userAnswers[q.id] = val;
            if (val === "") {
                unanswered++;
            } else if (val == q.correctAnswer) {
                correct++;
            } else {
                incorrect++;
            }
        }
    });

    // Hiển thị kết quả lên màn hình Result
    document.getElementById('scoreText').textContent = `${correct}/${currentQuiz.questions.length}`;
    document.getElementById('correctCount').textContent = correct;
    document.getElementById('incorrectCount').textContent = incorrect;

    const unansweredEl = document.getElementById('unansweredCount');
    if (unansweredEl) unansweredEl.textContent = unanswered;

    showView('result');
});

// === CÁC NÚT ĐIỀU HƯỚNG ===
document.getElementById('btnBackToMenu').addEventListener('click', () => {
    if (confirm("Bạn có chắc muốn thoát? Tiến trình bài đang làm sẽ bị hủy bỏ.")) {
        showView('list');
    }
});

document.getElementById('btnRetry').addEventListener('click', () => {
    quizForm.reset();
    quizForm.dataset.mode = 'exam';
    const submitBtn = quizForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Nộp Bài Ngay';
    submitBtn.classList.remove('btn-outline');
    submitBtn.classList.add('btn-primary');

    // Tráo câu hỏi nhưng giữ nguyên các phần khi làm lại
    currentQuiz.questions = shuffleQuestionsBySection(currentQuiz.questions);

    // Gọi lại renderQuestions để xóa các class correct-answer/wrong-answer và bật lại input
    renderQuestions();
    showView('active');
});

document.getElementById('btnReview').addEventListener('click', () => {
    quizForm.dataset.mode = 'review';

    currentQuiz.questions.forEach(q => {
        const selectedVal = userAnswers[q.id];
        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const inputs = document.querySelectorAll(`input[name="question_${q.id}"]`);
            inputs.forEach(input => {
                input.disabled = true;
                const label = input.closest('label');
                const val = parseInt(input.value);
                if (val === q.correctIndex) {
                    label.classList.add('correct-answer');
                } else if (val === selectedVal) {
                    label.classList.add('wrong-answer');
                }
            });
        } else if (qType === 'short_answer') {
            const input = document.querySelector(`input[name="question_${q.id}"]`);
            input.disabled = true;
            const container = input.closest('.short-answer-container');
            const resDiv = container.querySelector('.practice-result');
            resDiv.style.display = 'block';
            if (selectedVal == q.correctAnswer) {
                resDiv.textContent = 'Chính xác: ' + q.correctAnswer;
                resDiv.style.color = 'var(--correct)';
                input.style.borderColor = 'var(--correct)';
            } else {
                resDiv.textContent = 'Đáp án đúng: ' + q.correctAnswer + ' (Bạn nhập: ' + (selectedVal || 'trống') + ')';
                resDiv.style.color = 'var(--wrong)';
                input.style.borderColor = 'var(--wrong)';
            }
        }
    });

    // Đổi nút nộp bài thành nút quay lại
    const submitBtn = quizForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Quay Lại Kết Quả';
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-outline');

    showView('active');
});

document.getElementById('btnBackToMenuFromResult').addEventListener('click', () => {
    showView('list');
});

// === LOGIC XÁC THỰC (AUTHENTICATION) ===
// Đã được gỡ bỏ theo yêu cầu

// === KHỞI CHẠY TỰ ĐỘNG LÚC LOAD TRANG ===
initQuizList();
