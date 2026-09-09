/* Generated from product.json by Tibia. GPL-3.0-or-later. */
#define PERONE_HAS_INPUT {{=it.product.parameters.some(x => x.direction == "input") ? 1 : 0}}
#define PERONE_HAS_OUTPUT {{=it.product.parameters.some(x => x.direction == "output") ? 1 : 0}}
#define PERONE_HAS_MIDI {{=it.product.buses.some(x => x.type == "midi" && x.direction == "input") ? 1 : 0}}
#define PERONE_HAS_TRANSPORT {{=it.product.transport?.sync ? 1 : 0}}
#define PERONE_HAS_MSG_IN {{=it.product.messaging?.uiToDspSize ? 1 : 0}}
#define PERONE_HAS_MSG_OUT {{=it.product.messaging?.dspToUiSize ? 1 : 0}}
#define PERONE_HAS_STATE {{=it.product.state?.dspCustom ? 1 : 0}}
