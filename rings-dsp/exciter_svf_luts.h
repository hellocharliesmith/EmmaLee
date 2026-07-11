// Declarations for exciter_svf_luts.cc — must be #included there BEFORE the
// definitions, or C++ gives them internal linkage by default (const globals
// aren't extern unless declared so before their first definition in the
// translation unit) and the wrapper's references to them fail to link.
#ifndef RINGS_DSP_EXCITER_SVF_LUTS_H_
#define RINGS_DSP_EXCITER_SVF_LUTS_H_

namespace elements {

extern const float lut_approx_svf_gain[];
extern const float lut_approx_svf_g[];
extern const float lut_approx_svf_r[];
extern const float lut_approx_svf_h[];

}  // namespace elements

#endif  // RINGS_DSP_EXCITER_SVF_LUTS_H_
