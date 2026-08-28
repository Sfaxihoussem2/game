// 🎲 كروت خاصة — كل كارت عندو effet حقيقي في اللعبة
// effect: 'double' | 'switch' | 'couple' | 'chaos'
// 'couple' و 'chaos' يجبدو معاهم سؤال/مهمة من الداتاباز (يتعمل في السيرفر)
module.exports = [
  { effect: 'double', title: '🎲 DOUBLE', text: 'النقاط ×2 في الكارت الجاي! ركّز شوية 😏' },
  { effect: 'double', title: '🎲 DOUBLE', text: 'الكارت اللي جاي يسوى في الضعف. الحظ معاك.' },
  { effect: 'double', title: '🎲 DOUBLE', text: 'حظّك ضرب اليوم: الكارت الجاي ×2 نقاط.' },
  { effect: 'double', title: '🎲 DOUBLE', text: 'دبّل نقاطك! الكارت الموالي يعدّ مرّتين.' },

  { effect: 'switch', title: '🔄 SWITCH', text: 'بدّل الدور توّا! شريكك هو اللي باش يسحب الكارت الجاي.' },
  { effect: 'switch', title: '🔄 SWITCH', text: 'الكارت هذا موش ليك: عدّي الدور لشريكك في الحين.' },
  { effect: 'switch', title: '🔄 SWITCH', text: 'قلبنا الطاولة 🔄 الدور ولّى لشريكك.' },
  { effect: 'switch', title: '🔄 SWITCH', text: 'استريّح شوية، الدور رجع للطرف الآخر.' },

  { effect: 'couple', title: '❤️ COUPLE BONUS', text: 'الزوز يجاوبو على نفس السؤال، والزوز ياخذو النقاط:' },
  { effect: 'couple', title: '❤️ COUPLE BONUS', text: 'سؤال مشترك: جاوبو الزوز، وشوفو كان توافقتو:' },
  { effect: 'couple', title: '❤️ COUPLE BONUS', text: 'هالمرة ما فماش دور: الزوز يحكيو على:' },
  { effect: 'couple', title: '❤️ COUPLE BONUS', text: 'نقاط للزوز! جاوبو كل واحد بدورو على:' },
  { effect: 'couple', title: '❤️ COUPLE BONUS', text: 'وقت مشترك ❤️ الزوز يجاوبو بصراحة على:' },

  { effect: 'chaos', title: '😂 CHAOS', text: 'كل واحد فيكم عندو مهمة، والزوز لازم يعملوها:' },
  { effect: 'chaos', title: '😂 CHAOS', text: 'فوضى! مهمة لكل واحد، ما فماش هروب 😂' },
  { effect: 'chaos', title: '😂 CHAOS', text: 'الزوز في نفس الوقت، كل واحد ومهمتو:' },
  { effect: 'chaos', title: '😂 CHAOS', text: 'CHAOS MODE 😈 مهمتين، وحدة لكل واحد:' },

  { effect: 'double', title: '🎲 DOUBLE', text: 'نقاط مضاعفة في الكارت الجاي — استغلها.' },
  { effect: 'couple', title: '❤️ COUPLE BONUS', text: 'الكارت هذا للزوز مع بعضهم. جاوبو على:' },
  { effect: 'chaos', title: '😂 CHAOS', text: 'مهمة لكل واحد فيكم، وإلي ما يعملهاش يخسر النقاط 😂' },
];
